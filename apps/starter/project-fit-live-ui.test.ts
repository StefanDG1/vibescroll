import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effects: [] as (() => unknown)[],
  live: undefined as undefined | ((value: any) => void),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useId: () => "fit-test",
  useState: (initial: any) => {
    const i = hooks.index++;
    if (!(i in hooks.cells))
      hooks.cells[i] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.cells[i],
      (value: any) => {
        hooks.cells[i] =
          typeof value === "function" ? value(hooks.cells[i]) : value;
      },
    ];
  },
  useRef: (initial: any) =>
    (hooks.cells[hooks.index++] ??= { current: initial }),
  useEffectEvent: (callback: any) => callback,
  useEffect: (callback: () => unknown) => {
    hooks.effects.push(callback);
  },
}));
vi.mock("./lib/use-source-live", () => ({
  useTrendsLive: (
    _org: string,
    _days: number,
    _day: number,
    _enabled: boolean,
    callback: (value: any) => void,
  ) => {
    hooks.live = callback;
  },
}));
import { ProjectFitBreakdown } from "./components/assistant-elements/project-fit-breakdown";
import { ProjectProposalComposer } from "./components/project-proposal-composer";
import { TrendsDashboard } from "./components/trends-dashboard";
type Node = ReactElement<Record<string, any>>;
function elements(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
function render(view: () => unknown) {
  hooks.index = 0;
  return elements(view());
}
const fit = {
  rubric: "topic-coverage-v1" as const,
  matched: 0,
  total: 1,
  criteria: [{ category: "coding", matched: false, terms: [] }],
};
const history = {
  samePost: [
    {
      id: "ready",
      title: "Current plan",
      version: 1,
      review: "unreviewed",
      current: true,
    },
  ],
  samePostLimited: false,
  relatedPosts: 0,
  relatedAccepted: 0,
  relatedRejected: 0,
  lastPlanActivityAt: null,
  measuredOutcomes: null,
};
afterEach(() => {
  hooks.cells = [];
  hooks.index = 0;
  hooks.effects = [];
  hooks.live = undefined;
  vi.unstubAllGlobals();
});

it("uses each acknowledged priority revision without requiring a parent refresh, then honors a newer server revision", async () => {
  let serverPriority: "normal" | "high" | "low" = "normal",
    serverRevision = 0;
  const onPriorityChange = vi.fn(
    async (priority: "normal" | "high" | "low", expectedRevision: number) => {
      expect(expectedRevision).toBe(serverRevision);
      serverRevision++;
      return { priority, revision: serverRevision };
    },
  );
  const view = () =>
    ProjectFitBreakdown({
      fit,
      projectName: "owned/project",
      history,
      priority: serverPriority,
      priorityRevision: serverRevision === 3 ? 3 : 0,
      onPriorityChange,
    });
  let select = render(view).find((n) => n.type === "select")!;
  await select.props.onChange({ target: { value: "high" } });
  select = render(view).find((n) => n.type === "select")!;
  expect(select.props.value).toBe("high");
  await select.props.onChange({ target: { value: "normal" } });
  expect(onPriorityChange.mock.calls.map((c) => c[1])).toEqual([0, 1]);
  serverPriority = "low";
  serverRevision = 3;
  select = render(view).find((n) => n.type === "select")!;
  expect(select.props.value).toBe("low");
  await select.props.onChange({ target: { value: "high" } });
  expect(onPriorityChange.mock.calls.at(-1)![1]).toBe(3);
});

it("opens an existing zero-overlap plan with its score and omits unrelated new suggestions", () => {
  const nodes = render(() =>
    ProjectProposalComposer({
      organizationId: "org",
      sourceId: "source",
      analysisVersionId: "v1",
      insight: { id: "i", title: "Title", claim: "Claim" },
      projects: [{ id: "p", name: "Owned" }],
      suggestions: [
        { id: "unrelated", name: "Unrelated", topics: [], fit },
        { id: "p", name: "Owned", topics: [], fit, history },
      ],
      disabled: false,
      call: vi.fn(),
    }),
  );
  expect(nodes.some((n) => n.props.href === "/app/org/proposals/ready")).toBe(
    true,
  );
  expect(
    nodes.find((n) => n.type === ProjectFitBreakdown)!.props.fit.matched,
  ).toBe(0);
  expect(nodes.some((n) => n.props.children === "Unrelated")).toBe(false);
});

it.each([false, true])(
  "does not let an older HTTP Trends read overwrite a live update or denial: denial=%s",
  async (denied) => {
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    let finish!: (value: any) => void;
    const call = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(() => TrendsDashboard({ organizationId: "org", call }));
    const cleanups = hooks.effects.splice(0).map((effect) => effect());
    const current = {
      sample: { posts: 7, maximumPosts: 12 },
      totals: { windowLikes: 1, windowSaves: 0, limited: false },
      creators: [],
      categories: [],
      posts: [],
      windowEnd: 86400000,
    };
    hooks.live!(denied ? null : current);
    finish({ ...current, sample: { ...current.sample, posts: 2 } });
    await Promise.resolve();
    await Promise.resolve();
    const nodes = render(() =>
      TrendsDashboard({ organizationId: "org", call }),
    );
    expect(nodes.some((n) => n.props.title === "Trends unavailable")).toBe(
      denied,
    );
    expect(
      nodes.some((n) => n.type === "strong" && n.props.children === 7),
    ).toBe(!denied);
    for (const cleanup of cleanups)
      if (typeof cleanup === "function") cleanup();
  },
);
