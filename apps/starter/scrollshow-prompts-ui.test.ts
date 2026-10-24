import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hooks = vi.hoisted(() => ({
  real: false,
  motion: true,
  desktop: true,
  cells: [] as any[],
  index: 0,
  effectIndex: 0,
  effects: [] as {
    deps: unknown[];
    cleanup?: () => void;
    run?: () => unknown;
  }[],
  unsubscribers: [] as (() => void)[],
  observer: null as null | {
    callback: (entries: any[]) => void;
    target: unknown;
    disconnect: () => void;
  },
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useState: (initial: any) => {
      if (hooks.real) return real.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.cells))
        hooks.cells[index] =
          typeof initial === "function" ? initial() : initial;
      return [
        hooks.cells[index],
        (value: any) => {
          hooks.cells[index] =
            typeof value === "function" ? value(hooks.cells[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (hooks.real) return real.useRef(initial);
      const index = hooks.index++;
      return (hooks.cells[index] ??= { current: initial });
    },
    useId: () => (hooks.real ? real.useId() : "example-choice"),
    useEffect: (run: () => unknown, deps: unknown[]) => {
      if (hooks.real) return real.useEffect(run as () => void, deps);
      const index = hooks.effectIndex++;
      const old = hooks.effects[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        old?.cleanup?.();
        hooks.effects[index] = { deps, run };
      }
    },
    useSyncExternalStore: (
      subscribe: (listener: () => void) => () => void,
      snapshot: () => unknown,
      server: () => unknown,
    ) => {
      if (hooks.real)
        return real.useSyncExternalStore(subscribe, snapshot, server);
      const index = hooks.index++;
      if (!(index in hooks.cells)) {
        hooks.cells[index] = true;
        hooks.unsubscribers.push(subscribe(() => {}));
      }
      return snapshot();
    },
  };
});
vi.mock("./components/motion-preference", async (original) => {
  const real =
    await original<typeof import("./components/motion-preference")>();
  return {
    ...real,
    useInterfaceMotion: () =>
      hooks.real ? real.useInterfaceMotion() : hooks.motion,
  };
});
import { ScrollShowPrompts } from "./components/scrollshow-prompts";
type Node = ReactElement<Record<string, any>>;
const destinations = [
  "/example#sample-evidence",
  "/example#decision-title",
  "/example#existing-result",
  "/demo?view=library",
  "/help/getting-started",
];
function elements(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isValidElement(value)) return text((value as Node).props.children);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function button(tree: unknown, name: string) {
  const node = elements(tree).find(
    (item) => item.type === "button" && text(item) === name,
  );
  expect(node, name).toBeDefined();
  return node!;
}
function choice(tree: unknown) {
  return elements(tree).find((node) => node.type === "select")!;
}
function render() {
  hooks.index = 0;
  hooks.effectIndex = 0;
  const tree = ScrollShowPrompts();
  (tree.props.ref as { current: unknown }).current ??= {};
  for (const effect of hooks.effects)
    if (effect.run) {
      const cleanup = effect.run();
      effect.run = undefined;
      effect.cleanup =
        typeof cleanup === "function" ? (cleanup as () => void) : undefined;
    }
  return tree;
}
function intersect(visible: boolean) {
  expect(hooks.observer).not.toBeNull();
  hooks.observer!.callback([
    {
      target: hooks.observer!.target,
      isIntersecting: visible,
      intersectionRatio: visible ? 0.75 : 0,
    },
  ]);
}
function ready() {
  render();
  intersect(true);
  return render();
}
function play() {
  button(ready(), "Play examples").props.onClick();
  return render();
}
beforeEach(() => {
  vi.useFakeTimers();
  hooks.motion = true;
  hooks.desktop = true;
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => ({
      get matches() {
        return hooks.desktop;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: any[]) => void) {
        hooks.observer = { callback, target: null, disconnect: vi.fn() };
      }
      observe(target: unknown) {
        hooks.observer!.target = target;
      }
      disconnect() {
        hooks.observer!.disconnect();
      }
    },
  );
});
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  for (const unsubscribe of hooks.unsubscribers) unsubscribe();
  hooks.real = false;
  hooks.cells = [];
  hooks.effects = [];
  hooks.unsubscribers = [];
  hooks.observer = null;
  hooks.index = 0;
  hooks.effectIndex = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("SSR renders the actual native choice, initial destination and every ordinary no-JavaScript alternative", () => {
  hooks.real = true;
  const html = renderToStaticMarkup(createElement(ScrollShowPrompts));
  expect(html).toContain("What would you like to explore?");
  expect(html).toContain("starts no analysis");
  expect(html).toContain("<select");
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<input");
  for (const destination of destinations)
    expect(html).toContain(`href="${destination}"`);
  expect(html).not.toContain("aria-live");
  expect(html).toContain("JavaScript is off");
  expect(vi.getTimerCount()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});
it("starts static despite eligible desktop visibility and exposes accurate synthetic/recorded/guide labels", async () => {
  let tree = ready();
  expect(window.matchMedia).toHaveBeenCalledWith(
    "(min-width: 768px) and (hover: hover) and (pointer: fine)",
  );
  expect(choice(tree).props.value).toBe(0);
  expect(text(tree)).toContain("Authored synthetic passage");
  await vi.advanceTimersByTimeAsync(12000);
  tree = render();
  expect(choice(tree).props.value).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  choice(tree).props.onChange({ target: { value: "2" } });
  expect(text(render())).toContain(
    "Founder-account production output captured October 22, 2026",
  );
  choice(render()).props.onChange({ target: { value: "4" } });
  expect(text(render())).toContain("Help guide");
});
it("cycles whole choices only after explicit Play and stops immediately on Pause", async () => {
  let tree = play();
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(2999);
  expect(choice(render()).props.value).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  tree = render();
  expect(choice(tree).props.value).toBe(1);
  button(tree, "Pause examples").props.onClick();
  tree = render();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(9000);
  expect(choice(render()).props.value).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["focus", "keyboard", "selection"])(
  "pauses on %s until explicit Play",
  async (event) => {
    let tree = play();
    if (event === "focus") tree.props.onFocusCapture();
    if (event === "keyboard") tree.props.onKeyDownCapture();
    if (event === "selection")
      choice(tree).props.onChange({ target: { value: "3" } });
    tree = render();
    const selected = choice(tree).props.value;
    await vi.advanceTimersByTimeAsync(6000);
    expect(choice(render()).props.value).toBe(selected);
    button(render(), "Play examples").props.onClick();
    render();
    await vi.advanceTimersByTimeAsync(3000);
    expect(choice(render()).props.value).toBe((selected + 1) % 5);
  },
);
it("restarts the first choice with a complete fresh dwell even if it is already selected", async () => {
  play();
  await vi.advanceTimersByTimeAsync(2900);
  button(render(), "Restart examples").props.onClick();
  render();
  await vi.advanceTimersByTimeAsync(2999);
  expect(choice(render()).props.value).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(choice(render()).props.value).toBe(1);
});
it.each(["hidden", "offscreen"])(
  "suspends %s without catch-up, then begins a fresh dwell",
  async (condition) => {
    play();
    await vi.advanceTimersByTimeAsync(1500);
    if (condition === "hidden") Object.assign(document, { hidden: true });
    else intersect(false);
    render();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(12000);
    expect(choice(render()).props.value).toBe(0);
    if (condition === "hidden") Object.assign(document, { hidden: false });
    else intersect(true);
    render();
    await vi.advanceTimersByTimeAsync(2999);
    expect(choice(render()).props.value).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(choice(render()).props.value).toBe(1);
  },
);
it.each(["mobile", "reduced motion"])(
  "keeps %s static with manual navigation available",
  async (condition) => {
    if (condition === "mobile") hooks.desktop = false;
    else hooks.motion = false;
    let tree = ready();
    expect(button(tree, "Play examples").props.disabled).toBe(true);
    expect(button(tree, "Restart examples").props.disabled).toBe(true);
    choice(tree).props.onChange({ target: { value: "4" } });
    tree = render();
    expect(
      elements(tree).find(
        (node) => node.type === "a" && text(node) === "Try this example",
      )!.props.href,
    ).toBe(destinations[4]);
    await vi.advanceTimersByTimeAsync(9000);
    expect(choice(render()).props.value).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("cleans the active timeout, observer and external subscriptions on unmount", async () => {
  play();
  const observer = hooks.observer!;
  const listeners = hooks.unsubscribers.length;
  expect(listeners).toBe(2);
  for (const effect of hooks.effects) effect.cleanup?.();
  for (const unsubscribe of hooks.unsubscribers) unsubscribe();
  expect(vi.getTimerCount()).toBe(0);
  expect(observer.disconnect).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(9000);
  expect(hooks.cells[1]).toBe(0);
});

it.each(["mobile", "reduced motion"])(
  "suspends an opted-in cycle when %s becomes active",
  async (condition) => {
    play();
    await vi.advanceTimersByTimeAsync(1500);
    if (condition === "mobile") hooks.desktop = false;
    else hooks.motion = false;
    render();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(9000);
    expect(choice(render()).props.value).toBe(0);
  },
);
