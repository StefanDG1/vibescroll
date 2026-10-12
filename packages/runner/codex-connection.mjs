import { createHash } from "node:crypto";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { ChatGPTStore } from "./chatgpt-store.mjs";

// This is the runner's own official-client cache, never the desktop's cache.
// Tokens remain DPAPI-protected for this Windows user between isolated runs.
export class CodexConnectionStore extends ChatGPTStore {
  constructor() {
    super();
    this.directory = join(this.directory, "OfficialCodex");
    this.file = join(this.directory, "connection.dpapi");
  }
  async disconnect() {
    return this.lock(async () => rm(this.file, { force: true }));
  }
}

export function checkCodexCache(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 100000)
    throw Error("CHATGPT_CACHE_INVALID");
  let cache;
  try {
    cache = JSON.parse(raw);
  } catch {
    throw Error("CHATGPT_CACHE_INVALID");
  }
  if (
    !cache ||
    cache.OPENAI_API_KEY != null ||
    (cache.auth_mode !== undefined && cache.auth_mode !== "chatgpt") ||
    typeof cache.tokens?.access_token !== "string" ||
    !cache.tokens.access_token ||
    typeof cache.tokens.refresh_token !== "string" ||
    !cache.tokens.refresh_token ||
    typeof cache.tokens.account_id !== "string" ||
    !cache.tokens.account_id
  )
    throw Error("CHATGPT_CACHE_INVALID");
  return cache.tokens.account_id;
}

function accountBinding(account) {
  if (account?.type !== "chatgpt" || !account.email)
    throw Error("CHATGPT_RECONNECT_REQUIRED");
  return createHash("sha256").update(account.email).digest("hex");
}

// Call inside store.lock for the lifetime of the worker. The same connection
// serves eligible analysis, synthesis and evaluation tasks, not task approval.
export class SavedCodexConnection {
  constructor({ store, restore, capture }) {
    this.store = store;
    this.restore = restore;
    this.capture = capture;
  }
  async restoreSaved() {
    this.state = await this.store.read();
    const saved = this.state.connection;
    if (saved) {
      if (
        !/^[a-f0-9]{64}$/.test(saved.profileBinding ?? "") ||
        checkCodexCache(saved.cache) !== saved.accountId
      )
        throw Error("CHATGPT_CACHE_INVALID");
      await this.restore(saved.cache);
    } else {
      // Persist the installation identity before first consent.
      await this.store.write(this.state);
    }
    return Boolean(saved);
  }
  async connect(server, login) {
    let result = await server.request("account/read", { refreshToken: true });
    const reused = Boolean(this.state.connection);
    if (!result.account) {
      // An expired/revoked saved login requires an explicit reconnect. Never
      // start device login automatically in an unattended batch.
      if (reused) throw Error("CHATGPT_RECONNECT_REQUIRED");
      await login();
      result = await server.request("account/read", { refreshToken: true });
    }
    const binding = accountBinding(result.account);
    if (reused && binding !== this.state.connection.profileBinding)
      throw Error("CHATGPT_ACCOUNT_CHANGED");
    this.profileBinding = binding;
    await this.checkpoint();
    return { profileBinding: binding, reused };
  }
  async checkpoint() {
    if (!this.profileBinding) return;
    const cache = await this.capture();
    const accountId = checkCodexCache(cache);
    if (this.state.connection && accountId !== this.state.connection.accountId)
      throw Error("CHATGPT_ACCOUNT_CHANGED");
    const next = {
      ...this.state,
      connection: {
        profileBinding: this.profileBinding,
        accountId,
        cache,
        savedAt: Date.now(),
      },
    };
    await this.store.write(next);
    this.state = next;
  }
}
