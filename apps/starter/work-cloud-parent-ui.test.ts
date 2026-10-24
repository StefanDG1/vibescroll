import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({
  direct: false,
  cells: [] as any[],
  index: 0,
  effectIndex: 0,
  effects: [] as {
    deps: unknown[];
    run?: () => unknown;
    cleanup?: () => void;
  }[],
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useState: (initial: any) => {
      if (!state.direct) return real.useState(initial);
      const i = state.index++;
      if (!(i in state.cells))
        state.cells[i] = typeof initial === "function" ? initial() : initial;
      return [
        state.cells[i],
        (value: any) => {
          state.cells[i] =
            typeof value === "function" ? value(state.cells[i]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!state.direct) return real.useRef(initial);
      const i = state.index++;
      return (state.cells[i] ??= { current: initial });
    },
    useEffect: (run: () => unknown, deps: unknown[]) => {
      if (!state.direct) return real.useEffect(run as () => void, deps);
      const i = state.effectIndex++,
        old = state.effects[i];
      if (!old || deps.some((value, j) => value !== old.deps[j])) {
        old?.cleanup?.();
        state.effects[i] = { deps, run };
      }
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
import { SourceDetail } from "./components/console";
const now = 1800000000000,
  org = "private-owner-org";
const handoff = {
  sourceId: "source-one",
  organizationId: org,
  generation: 4,
  revision: now,
  expiresAt: now + 900000,
  inputHash: "a".repeat(64),
  model: "gpt-6.1-sol",
  effort: "medium",
  media: true,
  grantId: "grant-one",
  grantVersion: 2,
};
const queued = {
  _id: "source-one",
  organizationId: org,
  kind: "url",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  canonical: "https://www.youtube.com/watch?v=abcdefghijk",
  title: "A permitted video",
  text: "",
  tags: [],
  state: "queued",
  generation: 4,
  updatedAt: now,
  rightsAttested: true,
  privateLibrary: true,
  workCloudMediaEnabled: true,
  workCloudTextEnabled: false,
  workCloudHandoff: handoff,
  personalAnalysis: { executor: "work_cloud", state: "queued" },
};
function props(source: any = queued, extra: any = {}) {
  return {
    source,
    sources: [source],
    readOnly: false,
    busy: false,
    canSuggestCategories: false,
    demo: false,
    org,
    repos: [],
    devices: [],
    personalEnabled: false,
    linkAnalysisEnabled: false,
    cloudEnabled: false,
    call: vi.fn(),
    strictCall: vi.fn(),
    journey: undefined,
    onProposal: vi.fn(),
    ...extra,
  };
}
function render(parent: ReturnType<typeof props>) {
  state.direct = true;
  state.index = 0;
  state.effectIndex = 0;
  let tree;
  try {
    tree = SourceDetail(parent);
  } finally {
    state.direct = false;
  }
  for (const effect of state.effects)
    if (effect.run) {
      const run = effect.run;
      effect.run = undefined;
      const cleanup = run();
      effect.cleanup =
        typeof cleanup === "function" ? (cleanup as () => void) : undefined;
    }
  return renderToStaticMarkup(tree);
}
async function settle() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}
function remount() {
  for (const effect of state.effects) effect.cleanup?.();
  state.cells = [];
  state.effects = [];
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  remount();
});
afterEach(() => {
  remount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function server(value: any) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(value), {
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}
it("keeps the existing unclaimed handoff after the actual source-detail refresh and a full remount without another approval", async () => {
  const saved = {
    ...queued,
    state: "saved",
    generation: 3,
    updatedAt: now - 1,
    workCloudHandoff: undefined,
    personalAnalysis: undefined,
  };
  server(saved);
  render(props(saved));
  await settle();
  expect(render(props(saved))).not.toContain("Resume this unclaimed");
  // The Console's polled queued source causes the actual SourceDetail effect to reload it.
  server(queued);
  const parent = props(queued);
  render(parent);
  await settle();
  let html = render(parent);
  expect(html).toContain("Resume this unclaimed Work Cloud handoff");
  expect(html).toContain("sourceId source-one, generation 4");
  expect(html).toContain("work_cloud_prepare");
  expect(html).toContain(
    "before work_cloud_claim, prepare verified cached tools/model",
  );
  expect(html).toContain("supported Internet permission");
  expect(html).toContain("Do not claim while setup is pending");
  expect(html).toContain("gpt-6.1-sol, medium");
  expect(parent.strictCall).not.toHaveBeenCalled();
  expect(parent.call).not.toHaveBeenCalled();
  remount();
  render(parent);
  await settle();
  html = render(parent);
  expect(html).toContain("Resume this unclaimed Work Cloud handoff");
  expect(html).not.toContain("leaseToken");
});
it("hides an old unclaimed receipt immediately when the polled source is claimed, before a delayed detail response", async () => {
  server(queued);
  render(props());
  await settle();
  expect(render(props())).toContain("Resume this unclaimed");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const claimed = {
    ...queued,
    state: "processing",
    updatedAt: now + 1,
    personalAnalysis: { executor: "work_cloud", state: "running" },
  };
  expect(render(props(claimed))).not.toContain("Resume this unclaimed");
});
it.each(["gate", "revoked", "foreign", "viewer", "generation", "expired"])(
  "does not reveal fresh claim instructions after %s changes",
  async (change) => {
    const source: any = structuredClone(queued);
    const extra: any = {};
    if (change === "gate") source.workCloudMediaEnabled = false;
    if (change === "revoked") source.workCloudHandoff = undefined;
    if (change === "foreign") extra.org = "another-org";
    if (change === "viewer") extra.readOnly = true;
    if (change === "generation") source.workCloudHandoff.generation = 3;
    if (change === "expired") vi.setSystemTime(handoff.expiresAt + 1);
    server(source);
    const parent = props(source, extra);
    render(parent);
    await settle();
    const html = render(parent);
    expect(html).not.toContain("Resume this unclaimed Work Cloud handoff");
    expect(html).not.toContain("unique correlation UUID");
  },
);

it.each(["revoked", "gate", "selection"])(
  "fences the previously displayed receipt on same-generation %s poll before delayed detail",
  async (change) => {
    server(queued);
    render(props());
    await settle();
    expect(render(props())).toContain("Resume this unclaimed");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const next: any = structuredClone(queued);
    if (change === "revoked") next.workCloudHandoff = null;
    if (change === "gate") next.workCloudMediaEnabled = false;
    if (change === "selection") next.workCloudHandoff.grantVersion++;
    expect(render(props(next))).not.toContain("Resume this unclaimed");
  },
);
