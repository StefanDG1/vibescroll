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
  observers: [] as {
    callback: (entries: any[]) => void;
    targets: unknown[];
    disconnect: () => void;
  }[],
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
import { ScrollShowEmphasis } from "./components/scrollshow-emphasis";
import { readFileSync } from "node:fs";
type Node = ReactElement<Record<string, any>>;
const titles = [
  "Show an example first",
  "Make the first screen useful",
  "Does this fit my product?",
];
const content = createElement(
  "ol",
  { className: "ss-evidence-trail" },
  ...titles.map((title) =>
    createElement("li", { key: title }, createElement("h3", null, title)),
  ),
);
let cards: { dataset: Record<string, string> }[];
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
function button(tree: unknown, label: string) {
  const node = elements(tree).find(
    (item) => item.type === "button" && text(item) === label,
  );
  expect(node, label).toBeDefined();
  return node!;
}
function render() {
  hooks.index = 0;
  hooks.effectIndex = 0;
  const tree = ScrollShowEmphasis({ children: content });
  (tree.props.ref as { current: unknown }).current ??= {
    querySelectorAll: () => cards,
  };
  for (const effect of hooks.effects)
    if (effect.run) {
      const cleanup = effect.run();
      effect.run = undefined;
      effect.cleanup =
        typeof cleanup === "function" ? (cleanup as () => void) : undefined;
    }
  return tree;
}
function observer() {
  return hooks.observers.at(-1)!;
}
function intersect(index: number, ratio: number) {
  observer().callback([
    {
      target: cards[index],
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
    },
  ]);
}
function play() {
  button(render(), "Play scroll emphasis").props.onClick();
  return render();
}
function staticCards() {
  for (const card of cards) expect(card.dataset).toEqual({});
}
beforeEach(() => {
  cards = titles.map(() => ({ dataset: {} }));
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
      state: (typeof hooks.observers)[number];
      constructor(callback: (entries: any[]) => void) {
        this.state = { callback, targets: [], disconnect: vi.fn() };
        hooks.observers.push(this.state);
      }
      observe(target: unknown) {
        this.state.targets.push(target);
      }
      disconnect() {
        this.state.disconnect();
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
  hooks.observers = [];
  hooks.index = 0;
  hooks.effectIndex = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("SSR preserves all original explanation text with static default and no hidden content or live progress", () => {
  hooks.real = true;
  const html = renderToStaticMarkup(
    createElement(ScrollShowEmphasis, null, content),
  );
  for (const title of titles) expect(html).toContain(title);
  expect(html).toContain("Optional desktop scroll emphasis is paused");
  expect(html).not.toMatch(
    /data-emphasis-(visible|reveal)|aria-live|hidden=|opacity|progressbar/,
  );
  expect(html).toContain("not processing progress");
  expect(hooks.observers).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
});
it("stays static until explicit Play and reveals each sufficiently visible card once", () => {
  render();
  staticCards();
  expect(hooks.observers).toHaveLength(0);
  play();
  expect(observer().targets).toEqual(cards);
  intersect(0, 0.39);
  staticCards();
  intersect(0, 0.6);
  expect(cards[0].dataset).toEqual({
    emphasisVisible: "true",
    emphasisReveal: "true",
  });
  expect(cards[1].dataset).toEqual({});
  intersect(0, 0);
  staticCards();
  intersect(0, 0.9);
  expect(cards[0].dataset).toEqual({ emphasisVisible: "true" });
  expect(vi.getTimerCount()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["Pause", "focus", "keyboard"])(
  "settles immediately on %s and fences late observer callbacks",
  (action) => {
    let tree = play();
    intersect(0, 0.8);
    const old = observer();
    if (action === "Pause") button(tree, "Pause emphasis").props.onClick();
    else if (action === "focus") tree.props.onFocusCapture();
    else tree.props.onKeyDownCapture();
    tree = render();
    staticCards();
    expect(old.disconnect).toHaveBeenCalledOnce();
    old.callback([
      { target: cards[1], isIntersecting: true, intersectionRatio: 1 },
    ]);
    staticCards();
    expect(text(tree)).toContain("is paused");
  },
);
it("Replay explicitly permits a fresh single reveal without changing explanation content", () => {
  play();
  intersect(0, 0.8);
  intersect(0, 0);
  intersect(0, 0.8);
  expect(cards[0].dataset.emphasisReveal).toBeUndefined();
  button(render(), "Replay emphasis").props.onClick();
  const tree = render();
  intersect(0, 0.8);
  expect(cards[0].dataset.emphasisReveal).toBe("true");
  for (const title of titles) expect(text(tree)).toContain(title);
});
it("allows explicit Play and Replay after their native focus and keyboard capture events", () => {
  let tree = render();
  tree.props.onFocusCapture();
  tree.props.onKeyDownCapture();
  tree = render();
  button(tree, "Play scroll emphasis").props.onClick();
  tree = render();
  intersect(0, 0.8);
  expect(cards[0].dataset.emphasisReveal).toBe("true");
  tree.props.onFocusCapture();
  tree.props.onKeyDownCapture();
  tree = render();
  staticCards();
  expect(button(tree, "Replay emphasis").props.disabled).toBe(false);
  button(tree, "Replay emphasis").props.onClick();
  tree = render();
  intersect(0, 0.8);
  expect(cards[0].dataset.emphasisReveal).toBe("true");
  expect(button(tree, "Pause emphasis").props.disabled).toBe(false);
});
it("cleans hidden-page effects and resumes only viewport-checked emphasis without replay or catch-up", () => {
  play();
  intersect(0, 0.8);
  const old = observer();
  Object.assign(document, { hidden: true });
  render();
  staticCards();
  expect(old.disconnect).toHaveBeenCalledOnce();
  old.callback([
    { target: cards[2], isIntersecting: true, intersectionRatio: 1 },
  ]);
  staticCards();
  Object.assign(document, { hidden: false });
  render();
  staticCards();
  intersect(0, 0.8);
  expect(cards[0].dataset).toEqual({ emphasisVisible: "true" });
  expect(cards[2].dataset).toEqual({});
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["mobile", "reduced motion", "missing observer"])(
  "keeps %s static and all content available",
  (condition) => {
    if (condition === "mobile") hooks.desktop = false;
    else if (condition === "reduced motion") hooks.motion = false;
    else vi.stubGlobal("IntersectionObserver", undefined);
    const tree = render();
    expect(button(tree, "Play scroll emphasis").props.disabled).toBe(true);
    expect(button(tree, "Replay emphasis").props.disabled).toBe(true);
    for (const title of titles) expect(text(tree)).toContain(title);
    staticCards();
    expect(hooks.observers).toHaveLength(0);
  },
);
it.each(["mobile", "motion off"])(
  "cleans an opted-in effect when %s becomes active",
  (condition) => {
    play();
    intersect(0, 0.8);
    const old = observer();
    if (condition === "mobile") hooks.desktop = false;
    else hooks.motion = false;
    render();
    staticCards();
    expect(old.disconnect).toHaveBeenCalledOnce();
  },
);
it("disconnects observers/subscriptions on unmount and ignores stale callbacks", () => {
  play();
  intersect(1, 0.8);
  const old = observer();
  for (const effect of hooks.effects) effect.cleanup?.();
  for (const unsubscribe of hooks.unsubscribers) unsubscribe();
  staticCards();
  expect(old.disconnect).toHaveBeenCalledOnce();
  old.callback([
    { target: cards[0], isIntersecting: true, intersectionRatio: 1 },
  ]);
  staticCards();
  expect(window.matchMedia).toHaveBeenCalledWith(
    "(min-width: 768px) and (hover: hover) and (pointer: fine)",
  );
  expect(document.removeEventListener).toHaveBeenCalledWith(
    "visibilitychange",
    expect.any(Function),
  );
  expect(vi.getTimerCount()).toBe(0);
});
it("limits CSS to opt-in desktop decoration without changing text opacity, clipping or layout", () => {
  const css = readFileSync(
    new URL("./app/public.css", import.meta.url),
    "utf8",
  );
  const block = css.slice(
    css.indexOf(".public-site .ss-emphasis-controls"),
    css.indexOf(".public-site .ss-evidence-trail li:not"),
  );
  expect(block).toContain("prefers-reduced-motion: no-preference");
  expect(block).toContain("translateY(6px)");
  expect(block).toContain('data-emphasis-visible="true"');
  expect(block).not.toMatch(
    /opacity|height:\s*0|overflow:\s*hidden|display:\s*none|color:\s*transparent/,
  );
});
