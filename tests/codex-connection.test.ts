import { expect, it, vi } from "vitest";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  CodexConnectionStore,
  SavedCodexConnection,
  checkCodexCache,
} from "../packages/runner/codex-connection.mjs";

const cache = (access = "synthetic-access", account = "account-a") =>
  JSON.stringify({
    OPENAI_API_KEY: null,
    tokens: {
      account_id: account,
      access_token: access,
      refresh_token: "synthetic-refresh",
    },
  });

function harness() {
  let state: any = {
    version: 1,
    hostId: "urn:uuid:01234567-89ab-4cde-8123-456789abcdef",
    profiles: [],
  };
  let workerCache = cache();
  let account: any = null;
  const store = {
    read: async () => structuredClone(state),
    write: async (value: any) => {
      state = structuredClone(value);
    },
  };
  const restore = vi.fn(async (value: string) => {
    workerCache = value;
  });
  const server = {
    request: vi.fn(async () => ({ account })),
  };
  const login = vi.fn(async () => {
    account = { type: "chatgpt", email: "a@example.test" };
  });
  const connection = () =>
    new SavedCodexConnection({
      store,
      restore,
      capture: async () => workerCache,
    });
  return {
    store,
    server,
    login,
    restore,
    connection,
    state: () => state,
    rotate: (value: string) => {
      workerCache = value;
    },
    account: (value: any) => {
      account = value;
    },
  };
}

it("signs in once and reuses the same connection for a new isolated run", async () => {
  const h = harness(),
    first = h.connection();
  expect(await first.restoreSaved()).toBe(false);
  const initial = await first.connect(h.server, h.login);
  expect(initial.reused).toBe(false);
  expect(h.login).toHaveBeenCalledTimes(1);
  const second = h.connection();
  expect(await second.restoreSaved()).toBe(true);
  expect(h.restore).toHaveBeenCalledWith(cache());
  expect(await second.connect(h.server, h.login)).toEqual({
    ...initial,
    reused: true,
  });
  expect(h.login).toHaveBeenCalledTimes(1);
  expect(h.server.request).toHaveBeenCalledWith("account/read", {
    refreshToken: true,
  });
  expect(h.state().hostId).toBe(
    "urn:uuid:01234567-89ab-4cde-8123-456789abcdef",
  );
});

it("saves official-client token rotation for the next run without another login", async () => {
  const h = harness(),
    c = h.connection();
  await c.restoreSaved();
  await c.connect(h.server, h.login);
  h.rotate(cache("synthetic-renewed"));
  await c.checkpoint();
  const next = h.connection();
  await next.restoreSaved();
  expect(h.restore).toHaveBeenLastCalledWith(cache("synthetic-renewed"));
  await next.connect(h.server, h.login);
  expect(h.login).toHaveBeenCalledTimes(1);
});

it("requires reconnection for a revoked session without starting unattended login", async () => {
  const h = harness(),
    c = h.connection();
  await c.restoreSaved();
  await c.connect(h.server, h.login);
  h.account(null);
  const next = h.connection();
  await next.restoreSaved();
  await expect(next.connect(h.server, h.login)).rejects.toThrow(
    "CHATGPT_RECONNECT_REQUIRED",
  );
  expect(h.login).toHaveBeenCalledTimes(1);
});

it("rejects API funding and account switches without overwriting the saved connection", async () => {
  const h = harness(),
    c = h.connection();
  await c.restoreSaved();
  await c.connect(h.server, h.login);
  const before = structuredClone(h.state());
  for (const account of [
    { type: "apiKey" },
    { type: "chatgpt", email: "b@example.test" },
  ]) {
    h.account(account);
    const next = h.connection();
    await next.restoreSaved();
    await expect(next.connect(h.server, h.login)).rejects.toThrow(
      /CHATGPT_(RECONNECT_REQUIRED|ACCOUNT_CHANGED)/,
    );
    expect(h.state()).toEqual(before);
  }
  h.rotate(cache("synthetic-other", "account-b"));
  await expect(c.checkpoint()).rejects.toThrow("CHATGPT_ACCOUNT_CHANGED");
  expect(h.state()).toEqual(before);
  expect(h.login).toHaveBeenCalledTimes(1);
});

it("does not silently replace a cache after transport or encrypted-storage failure", async () => {
  const h = harness(),
    c = h.connection();
  await c.restoreSaved();
  h.server.request.mockRejectedValueOnce(Error("provider unavailable"));
  await expect(c.connect(h.server, h.login)).rejects.toThrow(
    "provider unavailable",
  );
  expect(h.login).not.toHaveBeenCalled();
  h.store.write = async () => {
    throw Error("CHATGPT_STORAGE_UNAVAILABLE");
  };
  await expect(c.connect(h.server, h.login)).rejects.toThrow(
    "CHATGPT_STORAGE_UNAVAILABLE",
  );
  expect(h.state().connection).toBeUndefined();
});

it("rejects malformed, oversized, API-key and foreign-account credential caches", async () => {
  for (const raw of [
    "null",
    "{}",
    "invalid",
    "x".repeat(100001),
    JSON.stringify({ ...JSON.parse(cache()), OPENAI_API_KEY: "synthetic-api" }),
    JSON.stringify({ ...JSON.parse(cache()), auth_mode: "api" }),
  ])
    expect(() => checkCodexCache(raw)).toThrow("CHATGPT_CACHE_INVALID");
  const h = harness(),
    c = h.connection();
  await c.restoreSaved();
  await c.connect(h.server, h.login);
  h.state().connection.accountId = "account-b";
  await expect(h.connection().restoreSaved()).rejects.toThrow(
    "CHATGPT_CACHE_INVALID",
  );
  expect(h.restore).not.toHaveBeenCalled();
});

it.skipIf(process.platform !== "win32")(
  "protects the runner's own credentials with Windows DPAPI and removes only that connection",
  async () => {
    const store = new CodexConnectionStore();
    // A separate file in the app credential directory. Never touch a real login.
    store.file = store.file.replace(
      "connection.dpapi",
      `test-${randomUUID()}.dpapi`,
    );
    const synthetic = {
      version: 1,
      hostId: "urn:uuid:01234567-89ab-4cde-8123-456789abcdef",
      profiles: [],
      connection: { cache: cache() },
    };
    try {
      await store.lock(async () => {
        await store.write(synthetic);
      });
      const encrypted = await readFile(store.file, "utf8");
      expect(encrypted).not.toContain("synthetic-access");
      expect(encrypted).not.toContain("synthetic-refresh");
      expect(await store.read()).toEqual(synthetic);
      await store.disconnect();
      await expect(readFile(store.file)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await unlink(store.file).catch(() => {});
    }
  },
);
