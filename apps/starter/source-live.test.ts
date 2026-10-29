import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  clients: [] as any[],
}));
vi.mock("react", () => ({
  useEffectEvent: (fn: any) => fn,
  useEffect: (fn: any) => {
    state.cleanups.push(fn());
  },
}));
vi.mock("convex/browser", () => ({
  ConvexClient: class {
    closed = false;
    url: string;
    auth?: () => Promise<string | null>;
    receive?: (value: unknown) => void;
    error?: () => void;
    constructor(url: string) {
      this.url = url;
      state.clients.push(this);
    }
    setAuth(fetchToken: () => Promise<string | null>) {
      this.auth = fetchToken;
    }
    onUpdate(
      _query: unknown,
      _args: unknown,
      receive: (value: unknown) => void,
      error: () => void,
    ) {
      this.receive = receive;
      this.error = error;
    }
    async close() {
      this.closed = true;
    }
  },
}));
import { useSourceLive } from "./lib/use-source-live";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => {
  for (const cleanup of state.cleanups) cleanup?.();
  state.cleanups = [];
  state.clients = [];
  vi.unstubAllGlobals();
});
it("refreshes only the current browser session, delivers metadata and closes without late writes", async () => {
  const receive = vi.fn();
  const transport = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        url: "https://synthetic.convex.cloud",
        token: "synthetic-first-user-token",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        url: "https://synthetic.convex.cloud",
        token: "synthetic-renewed-user-token",
      }),
    );
  vi.stubGlobal("fetch", transport);
  useSourceLive("synthetic-source", true, receive);
  await settle();
  const client = state.clients[0];
  expect(client.url).toBe("https://synthetic.convex.cloud");
  expect(await client.auth()).toBe("synthetic-first-user-token");
  expect(await client.auth()).toBe("synthetic-renewed-user-token");
  client.receive({ linkPreview: { title: "Early title" } });
  expect(receive).toHaveBeenCalledWith({
    linkPreview: { title: "Early title" },
  });
  state.cleanups[0]();
  expect(client.closed).toBe(true);
  client.receive({ late: true });
  expect(receive).toHaveBeenCalledTimes(1);
  expect(
    transport.mock.calls.every(
      ([url, init]) =>
        url === "/api/realtime/session" &&
        init.method === "POST" &&
        init.cache === "no-store",
    ),
  ).toBe(true);
});
it("does not connect when disabled and discards private detail on a subscription authorization error", async () => {
  const transport = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        url: "https://synthetic.convex.cloud",
        token: "synthetic-user-token",
      }),
    );
  vi.stubGlobal("fetch", transport);
  useSourceLive("synthetic-source", false, vi.fn());
  expect(transport).not.toHaveBeenCalled();
  const receive = vi.fn();
  useSourceLive("synthetic-source", true, receive);
  await settle();
  state.clients[0].error();
  expect(receive).toHaveBeenCalledWith(null);
});
