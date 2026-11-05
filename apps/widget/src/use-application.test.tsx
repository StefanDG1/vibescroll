import { afterEach, beforeEach, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  dirty: false,
  host: {} as any,
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!harness.slots[index])
      harness.slots[index] = {
        value:
          typeof initial === "function"
            ? (initial as () => unknown)()
            : initial,
      };
    return [
      harness.slots[index].value,
      (next: unknown) => {
        harness.slots[index].value =
          typeof next === "function"
            ? (next as (old: unknown) => unknown)(harness.slots[index].value)
            : next;
        harness.dirty = true;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!harness.slots[index]) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useEffectEvent: (fn: unknown) => fn,
  useEffect: (fn: () => unknown, deps: unknown[]) => {
    const index = harness.cursor++;
    const old = harness.slots[index];
    if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
      harness.slots[index] = { deps, cleanup: old?.cleanup };
      harness.effects.push(() => {
        harness.slots[index].cleanup?.();
        harness.slots[index].cleanup = fn();
      });
    }
  },
}));
vi.mock("./host", () => ({ useHost: () => harness.host }));
import { useApplication } from "./use-application";
let model: ReturnType<typeof useApplication>;
const discovery = {
  selected_profile_id: "team",
  profiles: ["personal", "team"].map((id) => ({
    profile_id: id,
    name: id,
    grant_version: 4,
    projects: [],
  })),
  coverage: "Current grants.",
};
const state = {
  profile_id: "team",
  name: "Team",
  grant_version: 4,
  actions: { jobs: false, context: false, analysis: false },
  scope: "all",
};
function render() {
  harness.cursor = 0;
  harness.dirty = false;
  model = useApplication();
  while (harness.effects.length) harness.effects.shift()!();
}
async function flush() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    if (harness.dirty) render();
  }
}
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.dirty = false;
  vi.stubGlobal("document", {
    hidden: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  harness.host = {
    ready: true,
    error: "",
    route: null,
    input: null,
    initialPending: false,
    payload: { snapshot: discovery },
    call: vi.fn(async (name) =>
      name === "widget_state"
        ? state
        : name === "widget_profiles"
          ? discovery
          : {
              items: [],
              next_offset: 5,
              coverage: "An empty candidate page. Continue.",
            },
    ),
  };
});
afterEach(() => {
  for (const slot of harness.slots) if (slot?.cleanup) slot.cleanup();
  vi.unstubAllGlobals();
});

it("never restores an in-flight balance after a current access denial", async () => {
  let release!: (value: unknown) => void;
  harness.host.payload = {
    route: { view: "insight", profileId: "team", sourceId: "post" },
    snapshot: { ...state, actions: { jobs: true, analysis: true } },
  };
  harness.host.call = vi.fn(async (name) => {
    if (name === "get_processing_account")
      return new Promise((resolve) => {
        release = resolve;
      });
    if (name === "fetch")
      return {
        id: "post",
        title: "Retained post",
        url: "https://scroll.companynerve.com/app/team/posts/post",
        text: JSON.stringify({ state: "ready", insights: [] }),
      };
    throw Object.assign(new Error("Access revoked"), { code: "FORBIDDEN" });
  });
  render();
  await flush();
  expect(model.profileId).toBe("");
  expect(model.busy).toBe(false);
  expect(model.accountUnavailable).toBe(true);
  release({
    version: "processing-account-v1",
    availableCredits: 332,
    reservedCredits: 0,
    expiredReservedCredits: 0,
    observedAt: 1000,
    nextExpiry: null,
    allowanceKind: "admin",
    monthlyAllowance: 300,
    nextRenewal: null,
    processing: {
      allowed: true,
      reason: null,
      message: null,
      dimension: null,
      retryAt: null,
      limit: null,
      used: null,
    },
    reviewUrl: "https://scroll.companynerve.com/app/team/usage",
  });
  await flush();
  expect(model.account).toBeNull();
  expect(model.source).toBeNull();
});
it("consumes bootstrap, preserves the selected team, and never needs project or financial scope for a plain read", async () => {
  render();
  await flush();
  expect(harness.host.call.mock.calls.map(([name]: [string]) => name)).toEqual([
    "widget_state",
    "widget_browse",
  ]);
  expect(model.profileId).toBe("team");
  expect(model.account).toBeNull();
  expect(model.accountUnavailable).toBe(true);
  expect(model.next).toEqual({ offset: 5 });
  expect(model.coverage).toContain("empty candidate page");
});
it("waits for an initial host search and consumes its result without issuing a duplicate search", async () => {
  harness.host.input = { query: "useful" };
  harness.host.initialPending = true;
  harness.host.payload = null;
  render();
  await flush();
  expect(harness.host.call).not.toHaveBeenCalled();
  expect(model.search?.busy).toBe(true);
  harness.host.initialPending = false;
  harness.host.payload = {
    profile_id: "team",
    grant_version: 4,
    results: [],
    next_cursor: null,
    exhausted: true,
    has_more: false,
    coverage: "No visible matches.",
  };
  render();
  await flush();
  expect(model.search?.busy).toBe(false);
  expect(model.search?.page?.coverage).toBe("No visible matches.");
  expect(
    harness.host.call.mock.calls.some(([name]: [string]) => name === "search"),
  ).toBe(false);
});
it("does not let an old workspace page replace a newer selection", async () => {
  let release!: (value: unknown) => void;
  harness.host.call = vi.fn(async (name, args) => {
    if (name === "widget_profiles")
      return { ...discovery, selected_profile_id: args.profileId };
    if (name === "widget_state")
      return { ...state, profile_id: args.profileId };
    if (args.profileId === "team")
      return new Promise((resolve) => {
        release = resolve;
      });
    return {
      items: [
        {
          id: "personal-post",
          title: "Current personal post",
          url: "https://scroll.companynerve.com/app/personal/posts/personal-post",
        },
      ],
      coverage: "Personal page.",
    };
  });
  render();
  await flush();
  const newer = model.load("personal");
  await flush();
  await newer;
  release({
    items: [
      {
        id: "stale-team-post",
        title: "Old team post",
        url: "https://scroll.companynerve.com/app/team/posts/stale-team-post",
      },
    ],
    coverage: "Old page.",
  });
  await flush();
  expect(model.profileId).toBe("personal");
  expect(model.rows.map((item) => item.id)).toEqual(["personal-post"]);
  expect(model.coverage).toBe("Personal page.");
});
it("checks status for a ready post to discover pending reanalysis without losing the incumbent", async () => {
  harness.host.payload = {
    route: { profileId: "team", sourceId: "post", view: "insight" },
    snapshot: { ...state, actions: { jobs: true } },
  };
  harness.host.call = vi.fn(async (name) => {
    if (name === "fetch")
      return {
        id: "post",
        title: "Retained post",
        url: "https://scroll.companynerve.com/app/team/posts/post",
        text: JSON.stringify({
          state: "ready",
          insights: [
            {
              id: "idea",
              title: "Current idea",
              claim: "Retained claim",
              reference: {
                sourceId: "post",
                generation: 1,
                revision: 3,
                insightId: "idea",
                analysisVersionId: "incumbent",
              },
            },
          ],
        }),
      };
    if (name === "get_job_status")
      return {
        source_status: "ready",
        status: "completed",
        selected_analysis_version_id: "incumbent",
        pending_analysis_version: { state: "running" },
      };
    throw Error(`Unexpected ${name}`);
  });
  render();
  await flush();
  expect(model.source?.analysisVersionId).toBe("incumbent");
  expect(model.progress.pendingActive).toBe(true);
  expect(model.source?.insights[0].claim).toBe("Retained claim");
  expect(harness.host.call.mock.calls.map(([name]: [string]) => name)).toEqual([
    "fetch",
    "get_job_status",
  ]);
});
