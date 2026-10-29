import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
// These direct-render fixtures drive the existing REST/approval lifecycle.
// WebSocket auth and subscription teardown have their own focused fixture.
vi.mock("@/lib/use-source-live", () => ({
  useSourceLive: vi.fn(),
  usePostsLive: vi.fn(),
}));
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
it.each(["owner", "viewer", "unavailable"])(
  "offers only the current eligible %s the legacy privacy repair without Cloud authority",
  async (role) => {
    const source = {
      ...queued,
      state: "needs_upload",
      generation: 0,
      privateLibrary: false,
      workCloudMediaEnabled: false,
      workCloudTextEnabled: false,
      workCloudPrivateLibraryRequired: role !== "unavailable",
      workCloudHandoff: null,
      personalAnalysis: undefined,
    };
    server(source);
    const parent = props(source, { readOnly: role === "viewer" });
    render(parent);
    await settle();
    const html = render(parent);
    expect(html.includes("Review private-library setup")).toBe(
      role === "owner",
    );
    if (role === "owner")
      expect(html).toContain(`/app/${org}/team#private-library`);
    expect(html).not.toContain("Review Work Cloud video");
    expect(html).not.toContain("Resume this unclaimed Work Cloud handoff");
    expect(parent.strictCall).not.toHaveBeenCalled();
    expect(parent.call).not.toHaveBeenCalled();
  },
);
it("keeps a post visible when its automatic intent expires and puts progress ahead of its summary", async () => {
  const source = {
    ...queued,
    generation: 0,
    state: "needs_upload",
    personalAnalysis: undefined,
    workCloudHandoff: undefined,
    workCloudSaveIntent: { generation: 0, expiresAt: now + 1000 },
    workCloudLinkSetup: { monitorReady: true },
  };
  server(source);
  const parent = props(source);
  render(parent);
  await settle();
  let html = render(parent);
  expect(html).toContain("Waiting for ChatGPT");
  expect(html.indexOf("Analysis progress")).toBeLessThan(
    html.indexOf("AI summary"),
  );
  vi.advanceTimersByTime(1001);
  html = render(parent);
  expect(html).toContain("Analysis request expired");
  expect(html).toContain("AI summary");
  expect(html).not.toContain("This source is unavailable");
  expect(parent.call).not.toHaveBeenCalled();
  expect(parent.strictCall).not.toHaveBeenCalled();
});
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
  const html = render(props(claimed));
  expect(html).not.toContain("Resume this unclaimed");
  expect(html).not.toContain("Waiting for Cloud");
  expect(html).toContain("Analyzing the evidence");
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

it.each([false, true])(
  "removes obsolete manual video review when automatic setup is available, ready=%s",
  async (ready) => {
    const source = {
      ...queued,
      url: "https://www.instagram.com/reel/DeTest000001/",
      state: "needs_upload",
      generation: 0,
      workCloudHandoff: null,
      personalAnalysis: undefined,
      workCloudLinkSetup: {
        configured: ready,
        monitorReady: ready,
        chatLinksEnabled: ready,
      },
    };
    server(source);
    const parent = props(source);
    render(parent);
    await settle();
    const html = render(parent);
    expect(html).toContain("My own Cloud Work");
    expect(html).toContain(
      ready ? "Analyze using Cloud defaults" : "Complete or resume Cloud setup",
    );
    expect(html).not.toContain("Advanced: manual Cloud handoff");
    expect(html).not.toContain("Review Work Cloud video");
    expect(html).not.toContain("Experimental Work Cloud video");
    expect(parent.strictCall).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([url]) => !String(url).includes("work-cloud")),
    ).toBe(true);
  },
);
it("does not offer automatic video defaults for a separate unsupported source route", async () => {
  const source = {
    ...queued,
    state: "needs_upload",
    generation: 0,
    workCloudHandoff: null,
    personalAnalysis: undefined,
    workCloudLinkSetup: null,
  };
  server(source);
  const parent = props(source);
  render(parent);
  await settle();
  expect(render(parent)).not.toContain("Analyze using Cloud defaults");
});

it.each(["failed", "queued"])(
  "offers an explicit Cloud retry for an eligible never-claimed %s request without starting it on render",
  async (status) => {
    const source = {
      ...queued,
      state: status,
      url: "https://www.instagram.com/reel/DeTest000001/",
      workCloudHandoff: null,
      workCloudRetryEligible: true,
      workCloudLinkSetup: {
        configured: true,
        monitorReady: true,
        chatLinksEnabled: true,
      },
    };
    server(source);
    const parent = props(source);
    render(parent);
    await settle();
    const html = render(parent);
    expect(html).toContain("Retry using Cloud defaults");
    expect(html).not.toContain("Analyze using Cloud defaults");
    expect(parent.strictCall).not.toHaveBeenCalled();
  },
);

it("keeps a failed claimed/unknown attempt out of the retry flow", async () => {
  const source = {
    ...queued,
    state: "failed",
    workCloudHandoff: null,
    personalAnalysis: { executor: "work_cloud", state: "unknown" },
    workCloudRetryEligible: false,
    workCloudLinkSetup: {
      configured: true,
      monitorReady: true,
      chatLinksEnabled: true,
    },
  };
  server(source);
  const parent = props(source);
  render(parent);
  await settle();
  expect(render(parent)).not.toContain("Retry using Cloud defaults");
  expect(parent.strictCall).not.toHaveBeenCalled();
});
