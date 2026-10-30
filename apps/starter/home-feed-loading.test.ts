import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import type { FeedDetail, FeedPage } from "./lib/home-feed";

const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effectIndex: 0,
  effects: [] as {
    deps: unknown[];
    run?: () => unknown;
    cleanup?: () => void;
  }[],
  live: undefined as undefined | ((value: any) => void),
}));
vi.mock("./lib/use-source-live", () => ({
  usePostsLive: (
    _org: string,
    _ids: string[],
    _enabled: boolean,
    callback: (value: any) => void,
  ) => {
    hooks.live = callback;
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [
      hooks.cells[index],
      (value: any) => {
        hooks.cells[index] =
          typeof value === "function" ? value(hooks.cells[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) =>
    (hooks.cells[hooks.index++] ??= { current: initial }),
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = hooks.index++,
      old = hooks.cells[index];
    if (!old || deps.some((value, i) => value !== old.deps[i]))
      hooks.cells[index] = { callback, deps };
    return hooks.cells[index].callback;
  },
  useEffectEvent: (callback: unknown) => callback,
  useEffect: (run: () => unknown, deps: unknown[]) => {
    const index = hooks.effectIndex++,
      old = hooks.effects[index];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      old?.cleanup?.();
      hooks.effects[index] = { run, deps };
    }
  },
}));
import { HomeFeed } from "./components/home-feed";

type Node = ReactElement<Record<string, any>>;
function elements(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
function render(component: () => Node) {
  hooks.index = hooks.effectIndex = 0;
  const tree = component();
  for (const node of elements(tree))
    if (node.props.ref) node.props.ref.current = {};
  for (const effect of hooks.effects)
    if (effect.run) {
      const cleanup = effect.run();
      effect.run = undefined;
      effect.cleanup =
        typeof cleanup === "function" ? (cleanup as () => void) : undefined;
    }
  return tree;
}
async function flush() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}
function page(count = 5, ready = true, next: string | null = null): FeedPage {
  return {
    items: Array.from({ length: count }, (_, index) => ({
      id: `source-${index}` as FeedPage["items"][number]["id"],
      title: `Post ${index}`,
      state: ready ? "ready" : "failed",
      kind: "url",
      generation: 1,
      createdAt: 1,
      metadataUpdatedAt: 1,
      thumbnailAssetIds: [],
      authorName: null,
    })),
    next,
  };
}
function setup(initialPage = page()) {
  const events = new Map<string, (event: any) => void>();
  const observers: ((entries: any[]) => void)[] = [];
  vi.stubGlobal("window", {
    addEventListener: (name: string, callback: any) =>
      events.set(name, callback),
    removeEventListener: (name: string) => events.delete(name),
  });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.stubGlobal("Element", class {});
  vi.stubGlobal("KeyboardEvent", class {});
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: any[]) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      signal: AbortSignal;
    }
  >();
  const fetch = vi.fn(
    (url: string, options: RequestInit) =>
      new Promise((resolve, reject) =>
        pending.set(url, {
          resolve,
          reject,
          signal: options.signal as AbortSignal,
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const view = () =>
    HomeFeed({
      organizationId: "workspace",
      initialPage,
      readOnly: false,
      call: vi.fn(),
      onSave: vi.fn(),
      onPosts: vi.fn(),
    });
  return { view, fetch, pending, events, observers };
}
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.cells = [];
  hooks.effects = [];
  hooks.index = hooks.effectIndex = 0;
  hooks.live = undefined;
  vi.unstubAllGlobals();
});

it("loads only neighboring analyses, aborts distant reads and discards their late responses", async () => {
  const { view, fetch, pending } = setup();
  let tree = render(view);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/feed/source-0?organizationId=workspace",
    "/api/feed/source-1?organizationId=workspace",
  ]);
  elements(tree)
    .find((node) => node.props.post?.id === "source-3")!
    .props.onVisible();
  tree = render(view);
  expect(
    pending.get("/api/feed/source-0?organizationId=workspace")!.signal.aborted,
  ).toBe(true);
  expect(
    pending.get("/api/feed/source-1?organizationId=workspace")!.signal.aborted,
  ).toBe(true);
  for (const [url, request] of pending) {
    request.resolve({
      ok: true,
      json: async () =>
        ({ id: url.split("/").at(-1)!.split("?")[0] }) as FeedDetail,
    });
  }
  await flush();
  tree = render(view);
  const retained = elements(tree)
    .filter((node) => node.props.detail)
    .map((node) => node.props.detail.id);
  expect(retained).toEqual(["source-2", "source-3", "source-4"]);
  expect(fetch).toHaveBeenCalledTimes(5);
});

it("cannot drain filtered pages from one sentinel without a new browsing gesture", async () => {
  const { view, fetch, pending, observers, events } = setup(
    page(2, false, "cursor-1"),
  );
  render(view);
  observers.at(-1)!([{ isIntersecting: true }]);
  expect(fetch).toHaveBeenCalledTimes(1);
  pending
    .get("/api/posts/workspace?cursor=cursor-1")!
    .resolve({ ok: true, json: async () => page(2, false, "cursor-2") });
  await flush();
  render(view);
  observers.at(-1)!([{ isIntersecting: true }]);
  expect(fetch).toHaveBeenCalledTimes(1);
  events.get("wheel")!({ target: null });
  observers.at(-1)!([{ isIntersecting: true }]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toBe("/api/posts/workspace?cursor=cursor-2");
});

it("retains the visible post on a page failure and manually retries the same cursor", async () => {
  const { view, fetch, pending, observers } = setup(page(1, true, "cursor-1"));
  let tree = render(view);
  observers.at(-1)!([{ isIntersecting: true }]);
  pending.get("/api/posts/workspace?cursor=cursor-1")!.reject(Error("Offline"));
  await flush();
  tree = render(view);
  expect(
    elements(tree).some((node) => node.props.post?.id === "source-0"),
  ).toBe(true);
  const error = elements(tree).find(
    (node) => node.props.title === "Posts unavailable",
  )!;
  error.props.onRetry();
  expect(
    fetch.mock.calls.filter(([url]) => url.includes("cursor-1")),
  ).toHaveLength(2);
});

it("clears rendered and cached content on access loss and aborts pending reads", () => {
  const { view, pending, fetch } = setup();
  render(view);
  hooks.live!(null);
  const tree = render(view);
  expect(elements(tree).some((node) => node.props.post)).toBe(false);
  expect([...pending.values()].every((request) => request.signal.aborted)).toBe(
    true,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    elements(tree).some((node) => node.props.title === "Posts unavailable"),
  ).toBe(true);
});

it("revalidates a detail read that raced the first live version observation", async () => {
  const { view, pending, fetch } = setup(page(1));
  render(view);
  pending.get("/api/feed/source-0?organizationId=workspace")!.resolve({
    ok: true,
    json: async () => ({ id: "source-0", analysisVersionId: "old" }),
  });
  await flush();
  render(view);
  hooks.live!([
    {
      _id: "source-0",
      state: "ready",
      generation: 1,
      title: "Current title",
      updatedAt: 2,
      selectedAnalysisVersionId: "new",
      analysisSelectionRevision: 2,
    },
  ]);
  let tree = render(view);
  expect(
    elements(tree).find((node) => node.props.post?.id === "source-0")!.props
      .detail,
  ).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
  pending.get("/api/feed/source-0?organizationId=workspace")!.resolve({
    ok: true,
    json: async () => ({ id: "source-0", analysisVersionId: "new" }),
  });
  await flush();
  tree = render(view);
  expect(
    elements(tree).find((node) => node.props.post?.id === "source-0")!.props
      .detail.analysisVersionId,
  ).toBe("new");
});

it("keeps the authorized shared poster when live metadata has no local thumbnail", () => {
  const initial = page(1);
  initial.items[0].thumbnailAssetIds = ["cached-shared-frame"];
  const { view } = setup(initial);
  render(view);
  hooks.live!([
    {
      _id: "source-0",
      state: "ready",
      generation: 1,
      title: "Cached post",
      updatedAt: 1,
      thumbnailAssetIds: [],
    },
  ]);
  const tree = render(view);
  expect(
    elements(tree).find((node) => node.props.post?.id === "source-0")!.props
      .post.thumbnailAssetIds,
  ).toEqual(["cached-shared-frame"]);
});
