import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effects: [] as (() => any)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = hooks.index++;
    if (!(i in hooks.cells)) hooks.cells[i] = initial;
    return [
      hooks.cells[i],
      (value: any) => {
        hooks.cells[i] = value;
      },
    ];
  },
  useRef: (initial: any) =>
    (hooks.cells[hooks.index++] ??= { current: initial }),
  useEffect: (effect: () => any) => {
    hooks.effects.push(effect);
  },
}));
import { PreparedAnalysisControl } from "./components/prepared-analysis-control";
type Node = ReactElement<Record<string, any>>;
function nodes(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  return [value as Node, ...nodes((value.props as any).children)];
}
afterEach(() => {
  hooks.cells = [];
  hooks.index = 0;
  hooks.effects = [];
  vi.unstubAllGlobals();
});
const models = [
  {
    id: "meta/muse-spark-1.3-contributor",
    name: "Muse Contributor",
    efforts: ["medium"],
    defaultEffort: "medium",
    creditMultiplier: 1,
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    efforts: ["low", "max"],
    defaultEffort: "max",
    creditMultiplier: 3,
  },
];
const quote = {
  quoteHash: "a".repeat(64),
  maximumCredits: 6,
  preparationCredits: 0,
  analysisCredits: 6,
  reusedEvidenceId: "saved-evidence",
  cacheHit: false,
};
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function render(call = vi.fn()) {
  hooks.index = 0;
  hooks.effects = [];
  return nodes(
    PreparedAnalysisControl({
      sourceId: "post",
      ready: true,
      disabled: false,
      revision: "1",
      call,
      onChange: vi.fn(),
    }),
  );
}
it("uses the server model catalogue, maximum reasoning and exact quote, with a double-click guard", async () => {
  const network = vi.fn(async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    return Response.json({
      result:
        request.operation === "preparedAnalysisOptions" ? { models } : quote,
    });
  });
  vi.stubGlobal("fetch", network);
  render();
  hooks.effects[0]();
  await flush();
  let tree = render();
  tree
    .find((n) => n.props["aria-label"] === "Analysis model")!
    .props.onValueChange("gpt-6-luna");
  tree = render();
  hooks.effects[1]();
  await flush();
  const call = vi.fn(async () => ({ runId: "run" }));
  tree = render(call);
  expect(
    network.mock.calls
      .map(([, init]) => JSON.parse(init.body as string))
      .at(-1),
  ).toMatchObject({
    args: { model: "gpt-6-luna", effort: "max", reanalyze: true },
  });
  const start = tree.find(
    (n) => n.type === "button" && n.props.className === "primary",
  )!;
  await Promise.all([start.props.onClick(), start.props.onClick()]);
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0]).toMatchObject([
    "preparedAnalysisStart",
    {
      maximumCredits: 6,
      quoteHash: quote.quoteHash,
      model: "gpt-6-luna",
      effort: "max",
      reanalyze: true,
    },
  ]);
});
it("does not replace a newer model quote with a delayed earlier response", async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      if (request.operation === "preparedAnalysisOptions")
        return Response.json({ result: { models } });
      if (request.args.model === models[0].id)
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      return Response.json({ result: quote });
    }),
  );
  render();
  hooks.effects[0]();
  await flush();
  let tree = render();
  const dispose = hooks.effects[1]();
  tree
    .find((n) => n.props["aria-label"] === "Analysis model")!
    .props.onValueChange("gpt-6-luna");
  dispose();
  tree = render();
  hooks.effects[1]();
  await flush();
  resolveOld(Response.json({ result: { ...quote, maximumCredits: 2 } }));
  await flush();
  tree = render();
  const start = tree.find(
    (n) => n.type === "button" && n.props.className === "primary",
  )!;
  expect(start.props.children).toContain(6);
  expect(start.props.children).not.toContain(2);
});
