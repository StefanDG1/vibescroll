import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const hooks = vi.hoisted(() => ({ values: [] as any[], index: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useRef: (value: unknown) => {
    const index = hooks.index++;
    return (hooks.values[index] ??= { current: value });
  },
  useState: (value: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values))
      hooks.values[index] =
        typeof value === "function" ? (value as () => unknown)() : value;
    return [
      hooks.values[index],
      (next: any) => {
        hooks.values[index] =
          typeof next === "function" ? next(hooks.values[index]) : next;
      },
    ];
  },
}));
import {
  OwnPlanTaskPanel,
  type OwnPlanTaskProps,
} from "./components/own-plan-task-controls";
import { normalizeSubscriptionCapabilities } from "../../packages/runner/subscription-capabilities.mjs";
type Node = ReactElement<Record<string, any>>;
afterEach(() => {
  hooks.values = [];
  hooks.index = 0;
  vi.restoreAllMocks();
});
function render(props: OwnPlanTaskProps) {
  hooks.index = 0;
  return OwnPlanTaskPanel(props);
}
function elements(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (isValidElement(value)) return text((value as Node).props.children);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function button(tree: any, label: string) {
  return elements(tree).find(
    (node) => node.type === "button" && text(node) === label,
  )!;
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
const catalogue = normalizeSubscriptionCapabilities({
  data: [
    {
      model: "actual-only",
      displayName: "Actual model",
      supportedReasoningEfforts: [{ reasoningEffort: "xhigh" }],
      inputModalities: ["text"],
    },
  ],
});
function harness() {
  const calls = vi.fn(async (operation: string, args: any): Promise<any> => {
    if (operation === "localTaskCapabilities")
      return [
        {
          id: "owned-device",
          name: "My computer",
          catalogue,
          expiresAt: Date.now() + 300000,
        },
      ];
    if (operation === "localTaskQuote")
      return {
        hash: "quote-hash",
        expiresAt: Date.now() + 300000,
        maxInferenceCredits: 0,
        payload: {
          sourceBindings: [{ sourceId: "source", generation: 4 }],
          repositoryBindings: [
            { repositoryId: "repo", baseSha: "a".repeat(40) },
          ],
        },
      };
    if (operation === "localTaskApprove") return { runId: "run" };
    if (operation === "localTaskStatus")
      return {
        id: args.runId,
        state: "active",
        model: "actual-only",
        effort: "xhigh",
        deadline: Date.now() + 1800000,
        proposalIds: [],
        evaluationIds: [],
      };
    return { canceled: true };
  });
  const props: OwnPlanTaskProps = {
    organizationId: "org",
    source: { id: "source", title: "Owned source" },
    repositories: [{ id: "repo", name: "owned/project" }],
    call: calls,
  };
  const view = () => render(props);
  async function click(label: string) {
    const node = button(view(), label);
    expect(node.props.disabled).not.toBe(true);
    node.props.onClick();
    await flush();
  }
  function select(index: number, value: string) {
    elements(view())
      .filter((node) => node.type === "select")
      [index].props.onChange({ target: { value } });
  }
  async function choose() {
    await click("Load account choices");
    select(0, "owned-device");
    select(1, "actual-only");
    select(2, "xhigh");
    elements(view())
      .find((node) => node.type === "input" && node.props.type === "checkbox")!
      .props.onChange({ target: { checked: true } });
  }
  return { props, calls, view, click, choose, select };
}
it("makes no requests on render and exposes only actual advertised choices after explicit load", async () => {
  const h = harness();
  expect(text(h.view())).toContain("No paid API fallback");
  expect(h.calls).not.toHaveBeenCalled();
  await h.click("Load account choices");
  h.select(0, "owned-device");
  expect(text(h.view())).toContain("Actual model");
  expect(text(h.view())).not.toContain("gpt-6.1-sol");
  expect(button(h.view(), "Review own-subscription quote").props.disabled).toBe(
    true,
  );
});
it("finds an existing persisted task explicitly after reload without granting or dispatching new work", async () => {
  const h = harness();
  h.calls.mockImplementation(async (operation: string): Promise<any> => {
    if (operation === "localTaskResume")
      return {
        items: [
          {
            id: "existing",
            state: "queued",
            workload: "project_evaluation",
            model: "actual-only",
            effort: "xhigh",
            deadline: Date.now() + 10000,
            proposalIds: [],
            evaluationIds: [],
          },
        ],
        next: null,
      };
    if (operation === "localTaskStatus")
      return {
        id: "existing",
        state: "queued",
        model: "actual-only",
        effort: "xhigh",
        deadline: Date.now() + 10000,
        proposalIds: [],
        evaluationIds: [],
      };
    throw Error("Unexpected operation");
  });
  expect(h.calls).not.toHaveBeenCalled();
  await h.click("Find existing tasks");
  expect(h.calls).toHaveBeenCalledWith("localTaskResume", {
    organizationId: "org",
    sourceId: "source",
    cursor: null,
  });
  await h.click("Open task status");
  expect(text(h.view())).toContain("Task queued");
  expect(h.calls.mock.calls.map(([op]) => op)).toEqual([
    "localTaskResume",
    "localTaskStatus",
  ]);
});
it("quotes selected source/repositories and sends the exact quote only after explicit own-account consent", async () => {
  const h = harness();
  await h.choose();
  await h.click("Review own-subscription quote");
  const quoteArgs = h.calls.mock.calls.find(
    ([op]) => op === "localTaskQuote",
  )![1];
  expect(quoteArgs).toMatchObject({
    organizationId: "org",
    sourceId: "source",
    repositoryIds: ["repo"],
    model: "actual-only",
    effort: "xhigh",
    workload: "project_evaluation",
  });
  expect(button(h.view(), "Approve on my paired computer").props.disabled).toBe(
    true,
  );
  elements(h.view())
    .filter((node) => node.type === "input" && node.props.type === "checkbox")
    .at(-1)!
    .props.onChange({ target: { checked: true } });
  await h.click("Approve on my paired computer");
  expect(h.calls).toHaveBeenCalledWith("localTaskApprove", {
    ...quoteArgs,
    quoteHash: "quote-hash",
    quoteExpiresAt: expect.any(Number),
    useOwnPlan: true,
    maxInferenceCredits: 0,
  });
  expect(text(h.view())).toContain("Task active");
  expect(
    h.calls.mock.calls.filter(([op]) => op === "localTaskStatus"),
  ).toHaveLength(1);
});
it("invalidates the quote and consent when a model or effort changes", async () => {
  const h = harness();
  await h.choose();
  await h.click("Review own-subscription quote");
  h.select(2, "");
  expect(button(h.view(), "Approve on my paired computer")).toBeUndefined();
  expect(button(h.view(), "Review own-subscription quote").props.disabled).toBe(
    true,
  );
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
});
it("requires the proposal to be accepted and quotes its exact version without a source or repository override", async () => {
  const h = harness();
  h.props.proposal = {
    id: "proposal",
    version: 7,
    title: "Review source evidence",
    review: "unreviewed",
  };
  delete h.props.source;
  await h.click("Load account choices");
  h.select(0, "owned-device");
  h.select(1, "actual-only");
  h.select(2, "xhigh");
  expect(button(h.view(), "Review own-subscription quote").props.disabled).toBe(
    true,
  );
  h.props.proposal.review = "accepted";
  await h.click("Review own-subscription quote");
  const args = h.calls.mock.calls.find(([op]) => op === "localTaskQuote")![1];
  expect(args).toMatchObject({
    workload: "plan_draft",
    proposalId: "proposal",
    proposalVersion: 7,
  });
  expect(args).not.toHaveProperty("repositoryIds");
  expect(args).not.toHaveProperty("sourceId");
});
it("keeps a failed approval reviewable and never silently retries or polls", async () => {
  const h = harness();
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args) => {
    if (op === "localTaskApprove") throw Error("Sign-in expired");
    return base(op, args);
  });
  await h.choose();
  await h.click("Review own-subscription quote");
  elements(h.view())
    .filter((node) => node.type === "input" && node.props.type === "checkbox")
    .at(-1)!
    .props.onChange({ target: { checked: true } });
  await h.click("Approve on my paired computer");
  expect(text(h.view())).toContain("Sign-in expired");
  expect(
    h.calls.mock.calls.filter(([op]) => op === "localTaskApprove"),
  ).toHaveLength(1);
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskStatus")).toBe(
    false,
  );
  expect(button(h.view(), "Approve on my paired computer").props.disabled).toBe(
    false,
  );
});
it("clears another task's completed status before a resumed status request that fails", async () => {
  const h = harness();
  let statusReads = 0;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    if (op === "localTaskResume")
      return {
        items: [
          {
            id: statusReads ? "second" : "first",
            state: statusReads ? "queued" : "completed",
            model: "actual-only",
            effort: "xhigh",
            deadline: Date.now() + 100000,
            proposalIds: [],
            evaluationIds: [],
          },
        ],
        next: null,
      };
    if (op === "localTaskStatus") {
      statusReads++;
      if (args.runId === "second")
        throw Error("Current task status unavailable");
      return {
        id: "first",
        state: "completed",
        model: "actual-only",
        effort: "xhigh",
        deadline: Date.now() + 100000,
        proposalIds: [],
        evaluationIds: [],
      };
    }
    throw Error("Unexpected operation");
  });
  await h.click("Find existing tasks");
  await h.click("Open task status");
  expect(text(h.view())).toContain("Task completed");
  await h.click("Find existing tasks");
  await h.click("Open task status");
  expect(text(h.view())).not.toContain("Task completed");
  expect(text(h.view())).toContain("Current task status unavailable");
  expect(button(h.view(), "Load account choices").props.disabled).toBe(true);
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
});
it("does not reuse old completion when a new approval succeeds but its status read fails", async () => {
  const h = harness();
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    if (op === "localTaskResume")
      return {
        items: [
          {
            id: "old-completed",
            state: "completed",
            model: "actual-only",
            effort: "xhigh",
            deadline: Date.now() + 10000,
            proposalIds: [],
            evaluationIds: [],
          },
        ],
        next: null,
      };
    if (op === "localTaskStatus") {
      if (args.runId === "old-completed")
        return {
          id: args.runId,
          state: "completed",
          model: "actual-only",
          effort: "xhigh",
          deadline: Date.now() + 10000,
          proposalIds: [],
          evaluationIds: [],
        };
      throw Error("New approved task status unavailable");
    }
    return base(op, args);
  });
  await h.click("Find existing tasks");
  await h.click("Open task status");
  expect(text(h.view())).toContain("Task completed");
  await h.choose();
  await h.click("Review own-subscription quote");
  elements(h.view())
    .filter((node) => node.type === "input" && node.props.type === "checkbox")
    .at(-1)!
    .props.onChange({ target: { checked: true } });
  await h.click("Approve on my paired computer");
  expect(text(h.view())).not.toContain("Task completed");
  expect(text(h.view())).toContain("New approved task status unavailable");
  expect(button(h.view(), "Load account choices").props.disabled).toBe(true);
  expect(
    h.calls.mock.calls.filter(([op]) => op === "localTaskApprove"),
  ).toHaveLength(1);
});
it.each(["catalogue", "quote"])(
  "rejects an idle %s expiry at the actual approval event before dispatch",
  async (expired) => {
    const h = harness();
    const base = h.calls.getMockImplementation()!;
    const now = Date.now();
    h.calls.mockImplementation(async (op, args): Promise<any> => {
      const result = await base(op, args);
      if (op === "localTaskCapabilities")
        return result.map((device: any) => ({
          ...device,
          expiresAt: now + (expired === "catalogue" ? 1000 : 10000),
        }));
      if (op === "localTaskQuote")
        return {
          ...result,
          expiresAt: now + (expired === "quote" ? 1000 : 10000),
        };
      return result;
    });
    await h.choose();
    await h.click("Review own-subscription quote");
    elements(h.view())
      .filter((node) => node.type === "input" && node.props.type === "checkbox")
      .at(-1)!
      .props.onChange({ target: { checked: true } });
    const beforeExpiry = h.view();
    expect(
      button(beforeExpiry, "Approve on my paired computer").props.disabled,
    ).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(now + 1001);
    button(beforeExpiry, "Approve on my paired computer").props.onClick();
    await flush();
    expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
      false,
    );
    expect(text(h.view())).toContain("catalogue or quote expired");
    expect(button(h.view(), "Approve on my paired computer")).toBeUndefined();
  },
);
