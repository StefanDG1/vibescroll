import type { ProposalDraftStorage } from "../../starter/lib/proposal-draft-memory";
type Row = Record<string, unknown>;
type Entry = { key: string; value: string };
export type WidgetStateBridge = {
  widgetState?: unknown;
  setWidgetState?: (state: Row) => void;
};
const namespace = "vibescrollProposalDraftsV1";
const object = (value: unknown): value is Row =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Optional documented ChatGPT UI persistence, never model context or business state. */
export function widgetDraftStorage(
  bridge: () => WidgetStateBridge | undefined,
): ProposalDraftStorage {
  let observed: unknown;
  let cached: Entry[] | undefined;
  let unavailable = false;
  function read() {
    if (unavailable)
      throw Error("Widget draft storage is unavailable in this view.");
    const host = bridge();
    if (!host || typeof host.setWidgetState !== "function")
      throw Error("Widget state is unavailable.");
    const state = object(host.widgetState) ? host.widgetState : {};
    if (state.privateContent !== undefined && !object(state.privateContent))
      throw Error("Private widget state has another format.");
    const privateContent = (state.privateContent ?? {}) as Row;
    if (host.widgetState === observed && cached)
      return { host, state, privateContent, entries: cached };
    const saved = privateContent[namespace];
    if (
      saved !== undefined &&
      (!object(saved) || saved.version !== 1 || !Array.isArray(saved.entries))
    )
      throw Error("Draft widget state has another format.");
    const entries = saved && object(saved) ? (saved.entries as Entry[]) : [];
    if (
      entries.length > 40 ||
      entries.some(
        (entry) =>
          !object(entry) ||
          typeof entry.key !== "string" ||
          entry.key.length > 300 ||
          typeof entry.value !== "string" ||
          entry.value.length > 16384,
      ) ||
      new TextEncoder().encode(JSON.stringify(entries)).length > 65536
    )
      throw Error("Draft widget state exceeds its bound.");
    observed = host.widgetState;
    cached = entries.map((entry) => ({ key: entry.key, value: entry.value }));
    return { host, state, privateContent, entries: cached };
  }
  function write(key: string, value?: string) {
    if (key.length > 300 || (value?.length ?? 0) > 16384)
      throw Error("This draft exceeds its storage bound.");
    const current = read();
    const entries = current.entries.filter((entry) => entry.key !== key);
    if (value !== undefined) entries.push({ key, value });
    while (
      entries.length > 40 ||
      new TextEncoder().encode(JSON.stringify(entries)).length > 65536
    ) {
      const disposable = entries.findIndex(
        (entry) => !entry.key.endsWith(":request") && entry.key !== key,
      );
      if (disposable < 0) throw Error("Private draft storage is full.");
      entries.splice(disposable, 1);
    }
    try {
      current.host.setWidgetState!({
        ...current.state,
        privateContent: {
          ...current.privateContent,
          [namespace]: { version: 1, entries },
        },
      });
    } catch (failure) {
      unavailable = true;
      throw failure;
    }
    observed = current.host.widgetState;
    cached = entries;
  }
  return {
    getItem: (key) =>
      read().entries.find((entry) => entry.key === key)?.value ?? null,
    setItem: (key, value) => write(key, value),
    removeItem: (key) => write(key),
  };
}
