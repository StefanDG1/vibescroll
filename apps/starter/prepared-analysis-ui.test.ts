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
function render(call = vi.fn(), onChange = vi.fn()) {
  hooks.index = 0;
  hooks.effects = [];
  return nodes(
    PreparedAnalysisControl({
      sourceId: "post",
      ready: true,
      disabled: false,
      revision: "1",
      call,
      onChange,
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

async function readyControl(call = vi.fn(), onChange = vi.fn()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      return Response.json({
        result:
          request.operation === "preparedAnalysisOptions" ? { models } : quote,
      });
    }),
  );
  render(call, onChange);
  hooks.effects[0]();
  await flush();
  render(call, onChange);
  hooks.effects[1]();
  await flush();
  return render(call, onChange);
}

it("permits a fresh quote after proven pre-admission rejection without automatically starting another job", async () => {
  const call = vi.fn(async () => {
    throw Object.assign(new Error("Quote changed"), {
      code: "QUOTE_CHANGED",
      outcome: "rejected",
    });
  });
  let tree = await readyControl(call);
  const start = tree.find(
    (n) => n.type === "button" && n.props.className === "primary",
  )!;
  await start.props.onClick();
  tree = render(call);
  expect(tree.some((n) => n.props.className === "primary")).toBe(false);
  const error = tree.find((n) => n.props.title === "Review the current quote")!;
  nodes(error.props.action)
    .find((n) => n.type === "button")!
    .props.onClick();
  tree = render(call);
  hooks.effects[1]();
  await flush();
  tree = render(call);
  expect(tree.some((n) => n.props.className === "primary")).toBe(true);
  expect(call).toHaveBeenCalledTimes(1);
});

it("keeps an unconfirmed start locked while its direct recovery action only refreshes status", async () => {
  const call = vi.fn(async () => {
    throw Object.assign(new Error("Request not confirmed"), {
      code: "UNCLASSIFIED",
      outcome: "rejected",
    });
  });
  const onChange = vi.fn();
  let tree = await readyControl(call, onChange);
  const start = tree.find(
    (n) => n.type === "button" && n.props.className === "primary",
  )!;
  await start.props.onClick();
  tree = render(call, onChange);
  const error = tree.find((n) => n.props.title === "Check the existing work")!;
  nodes(error.props.action)
    .find((n) => n.type === "button")!
    .props.onClick();
  await start.props.onClick();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledTimes(1);
  expect(
    render(call, onChange).some((n) => n.props.className === "primary"),
  ).toBe(false);
});

it("shows a direct personal-billing recovery for a rejected quote without starting analysis", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      return request.operation === "preparedAnalysisOptions"
        ? Response.json({ result: { models } })
        : Response.json({ code: "INSUFFICIENT_CREDITS" }, { status: 400 });
    }),
  );
  const call = vi.fn();
  render(call);
  hooks.effects[0]();
  await flush();
  render(call);
  hooks.effects[1]();
  await flush();
  const error = render(call).find(
    (n) => n.props.title === "Review your personal credits",
  )!;
  expect(nodes(error.props.action).find((n) => n.props.href)!.props.href).toBe(
    "/app?view=billing&tier=pro",
  );
  expect(call).not.toHaveBeenCalled();
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
