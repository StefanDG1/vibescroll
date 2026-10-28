import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effectIndex: 0,
  effects: [] as {
    deps: unknown[];
    run?: () => unknown;
    cleanup?: () => void;
  }[],
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
  useEffect: (run: () => unknown, deps: unknown[]) => {
    const index = hooks.effectIndex++,
      old = hooks.effects[index];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      old?.cleanup?.();
      hooks.effects[index] = { run, deps };
    }
  },
}));
import { RecentPosts } from "./components/recent-posts";
import { PostThumbnail } from "./components/post-thumbnail";

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
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.cells = [];
  hooks.effects = [];
  hooks.index = hooks.effectIndex = 0;
  vi.unstubAllGlobals();
});

it("falls back to a retained frame after the thumbnail fails, then stops after all candidates fail", () => {
  const view = () =>
    PostThumbnail({ candidates: ["stale-preview", "real-frame"], kind: "url" });
  let image = elements(render(view)).find((node) => node.props.src)!;
  expect(image.props.src).toContain("stale-preview");
  expect(image.props.loading).toBe("lazy");
  image.props.onError();
  image = elements(render(view)).find((node) => node.props.src)!;
  expect(image.props.src).toContain("real-frame");
  image.props.onError();
  expect(elements(render(view)).some((node) => node.props.src)).toBe(false);
});

it("loads metadata pages lazily, deduplicates entries and leaves full detail unprefetched", async () => {
  let visible: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof visible) {
        visible = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const post = {
    id: "source1" as import("../../convex/_generated/dataModel").Id<"sources">,
    generation: 0,
    createdAt: 1,
    metadataUpdatedAt: 2,
    title: "Native title",
    authorName: "Creator",
    kind: "url",
    state: "ready",
    thumbnailAssetIds: ["asset1"],
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ items: [post, { ...post, id: "source2" }], next: null }),
    );
  vi.stubGlobal("fetch", request);
  const view = () =>
    RecentPosts({
      organizationId: "workspace",
      initialPage: { items: [post], next: "opaque+cursor" },
    });
  render(view);
  await flush();
  const tree = render(view);
  expect(request).toHaveBeenCalledTimes(0);
  const link = elements(tree).find((node) => node.props.href)!;
  expect(link.props.href).toBe("/app/workspace/posts/source1");
  expect(link.props.prefetch).toBe(false);
  visible([{ isIntersecting: false }]);
  expect(request).toHaveBeenCalledTimes(0);
  visible([{ isIntersecting: true }]);
  visible([{ isIntersecting: true }]);
  await flush();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toContain("cursor=opaque%2Bcursor");
  expect(elements(render(view)).filter((node) => node.props.href)).toHaveLength(
    2,
  );
  expect(
    request.mock.calls.every(([url]) => String(url).startsWith("/api/posts/")),
  ).toBe(true);
  expect(disconnect).toHaveBeenCalled();
});

it("aborts the pending metadata request when the page is left", () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }),
  );
  let visible: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof visible) {
        visible = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(() =>
    RecentPosts({
      organizationId: "workspace",
      initialPage: { items: [], next: "next" },
    }),
  );
  visible([{ isIntersecting: true }]);
  expect(signal?.aborted).toBe(false);
  hooks.effects[0].cleanup?.();
  expect(signal?.aborted).toBe(true);
});
