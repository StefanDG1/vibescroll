import { afterEach, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hooks = vi.hoisted(() => ({
  values: [] as any[],
  index: 0,
  real: false,
  mounted: false,
  cleanup: null as null | (() => void),
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useEffect: (effect: () => void | (() => void)) => {
      if (hooks.real) return;
      if (!hooks.mounted) {
        hooks.cleanup = effect() ?? null;
        hooks.mounted = true;
      }
    },
    useRef: (value: unknown) => {
      if (hooks.real) return real.useRef(value);
      const index = hooks.index++;
      return (hooks.values[index] ??= { current: value });
    },
    useLayoutEffect: (effect: () => void, dependencies: unknown[]) => {
      if (hooks.real) return;
      const index = hooks.index++,
        previous = hooks.values[index] as unknown[] | undefined;
      if (
        !previous ||
        dependencies.some((value, n) => !Object.is(value, previous[n]))
      ) {
        hooks.values[index] = dependencies;
        effect();
      }
    },
    useState: (value: unknown) => {
      if (hooks.real) return real.useState(value);
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
  };
});
import {
  OwnPlanTaskPanel,
  OwnPlanTaskControls,
  type OwnPlanTaskProps,
} from "./components/own-plan-task-controls";
import { normalizeSubscriptionCapabilities } from "../../packages/runner/subscription-capabilities.mjs";
type Node = ReactElement<Record<string, any>>;
afterEach(() => {
  hooks.cleanup?.();
  hooks.cleanup = null;
  hooks.mounted = false;
  hooks.values = [];
  hooks.index = 0;
  hooks.real = false;
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
    (node) =>
      node.type === "button" &&
      text(node).replace(/\s+/g, " ").trim() === label,
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
          admittedRuntime: {
            value: {
              schemaVersion: "local-task-runtime-v1",
              features: [
                "source_reanalysis_text_v1",
                "project_private_variant_v1",
                "project_apply_source_v1",
              ],
            },
            hash: "d".repeat(64),
            profileBinding: "e".repeat(64),
            expiresAt: Date.now() + 300000,
            sessionExpiresAt: Date.now() + 3600000,
          },
        },
      ];
    if (operation === "localTaskQuote")
      return {
        hash: "quote-hash",
        expiresAt: Date.now() + 300000,
        maxInferenceCredits: 0,
        payload: {
          ...(args.includeSourceContent !== undefined
            ? { includeSourceContent: args.includeSourceContent }
            : {}),
          ...(args.privateEvaluationBrief !== undefined
            ? { privateEvaluationBrief: args.privateEvaluationBrief }
            : {}),
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
    const repositoryLabel = elements(view()).find(
      (node) => node.type === "label" && text(node).trim() === "owned/project",
    );
    elements(repositoryLabel)
      .find((node) => node.type === "input")
      ?.props.onChange({ target: { checked: true } });
  }
  return { props, calls, view, click, choose, select };
}
it("defaults full source content on, binds the choice, and clears quote consent when switched off", async () => {
  const h = harness();
  await h.choose();
  const toggle = () =>
    elements(h.view()).find(
      (node) =>
        node.type === "input" &&
        node.props.type === "checkbox" &&
        node.props.checked === true,
    )!;
  expect(toggle()).toBeDefined();
  await h.click("Review own-subscription quote");
  expect(
    h.calls.mock.calls.find(([op]) => op === "localTaskQuote")?.[1]
      .includeSourceContent,
  ).toBe(true);
  toggle().props.onChange({ target: { checked: false } });
  expect(text(h.view())).not.toContain("Approve this exact request");
  await h.click("Review own-subscription quote");
  expect(
    h.calls.mock.calls.filter(([op]) => op === "localTaskQuote").at(-1)?.[1]
      .includeSourceContent,
  ).toBe(false);
});
it("uses the controlled full-content choice shared with the source page", async () => {
  const h = harness(),
    changed = vi.fn();
  h.props.sourceContentChoice = { include: false, onChange: changed };
  await h.choose();
  await h.click("Review own-subscription quote");
  expect(
    h.calls.mock.calls.find(([op]) => op === "localTaskQuote")?.[1]
      .includeSourceContent,
  ).toBe(false);
  const label = elements(h.view()).find(
    (node) =>
      node.type === "label" &&
      text(node).includes("Include full transcript and images"),
  )!;
  elements(label)
    .find((node) => node.type === "input")!
    .props.onChange({ target: { checked: true } });
  expect(changed).toHaveBeenCalledExactlyOnceWith(true);
});
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
function textarea(tree: unknown) {
  return elements(tree).find((node) => node.type === "textarea");
}
function setBrief(h: ReturnType<typeof harness>, value: string) {
  textarea(h.view())!.props.onChange({ target: { value } });
}
function consentToQuote(h: ReturnType<typeof harness>) {
  elements(h.view())
    .filter((node) => node.type === "input" && node.props.type === "checkbox")
    .at(-1)!
    .props.onChange({ target: { checked: true } });
}
const privateOrigin = {
  schemaVersion: "1.0.0" as const,
  kind: "private_evaluation_brief" as const,
  ownerId: "owner" as any,
  briefHash: "a".repeat(64),
  model: "actual-only",
  effort: "xhigh",
};
it("SSR keeps the advanced private brief optional, empty and request-free", () => {
  const h = harness();
  hooks.real = true;
  const html = renderToStaticMarkup(
    createElement(OwnPlanTaskControls, { ...h.props, privateLibrary: true }),
  );
  expect(html).toContain("Advanced: private evaluation focus");
  expect(html).toContain("<textarea");
  expect(html).toContain("0 / 4000 UTF-8 bytes");
  expect(html).toContain(
    "does not change the generic source analysis or shared catalog",
  );
  expect(html).not.toContain("<details open");
  expect(h.calls).not.toHaveBeenCalled();
});
it.each([undefined, false])(
  "omits private controls and arguments for privateLibrary=%s",
  async (flag) => {
    const h = harness();
    h.props.privateLibrary = flag;
    expect(textarea(h.view())).toBeUndefined();
    await h.choose();
    await h.click("Review own-subscription quote");
    expect(
      h.calls.mock.calls.find(([op]) => op === "localTaskQuote")![1],
    ).not.toHaveProperty("privateEvaluationBrief");
  },
);
it("preserves the default scope key and remounts the private mode without retaining a brief across scopes", () => {
  const h = harness();
  expect(OwnPlanTaskControls(h.props).key).toBe("org:source::");
  expect(OwnPlanTaskControls({ ...h.props, privateLibrary: true }).key).toBe(
    "org:source:::private",
  );
  expect(
    OwnPlanTaskControls({
      ...h.props,
      organizationId: "other",
      privateLibrary: true,
    }).key,
  ).not.toBe(OwnPlanTaskControls({ ...h.props, privateLibrary: true }).key);
});
it("binds exact untrimmed private text to quote review and approval", async () => {
  const h = harness();
  h.props.privateLibrary = true;
  const brief = "  Focus on café 🌱.\nKeep this exact spacing.  ";
  await h.choose();
  setBrief(h, brief);
  await h.click("Review own-subscription quote");
  const quoteArgs = h.calls.mock.calls.find(
    ([op]) => op === "localTaskQuote",
  )![1];
  expect(quoteArgs.privateEvaluationBrief).toBe(brief);
  const reviewed = elements(h.view()).find(
    (node) =>
      node.props["aria-label"] === "Private evaluation brief in this quote",
  )!;
  expect(
    elements(reviewed).find((node) => node.type === "p")!.props.children,
  ).toBe(brief);
  expect(button(h.view(), "Approve on my paired computer").props.disabled).toBe(
    true,
  );
  consentToQuote(h);
  await h.click("Approve on my paired computer");
  expect(
    h.calls.mock.calls.find(([op]) => op === "localTaskApprove")![1]
      .privateEvaluationBrief,
  ).toBe(brief);
});
it.each(["", " \n\t "])(
  "omits an empty private brief from quote and approval",
  async (brief) => {
    const h = harness();
    h.props.privateLibrary = true;
    await h.choose();
    setBrief(h, brief);
    await h.click("Review own-subscription quote");
    consentToQuote(h);
    await h.click("Approve on my paired computer");
    for (const [op, args] of h.calls.mock.calls)
      if (op === "localTaskQuote" || op === "localTaskApprove")
        expect(args).not.toHaveProperty("privateEvaluationBrief");
  },
);
it("counts UTF-8 bytes and blocks quote review above 4000 bytes without truncating input", async () => {
  const h = harness();
  h.props.privateLibrary = true;
  await h.choose();
  setBrief(h, "é".repeat(2000));
  expect(text(h.view())).toMatch(/4000\s+\/ 4000 UTF-8 bytes/);
  expect(button(h.view(), "Review own-subscription quote").props.disabled).toBe(
    false,
  );
  const over = "é".repeat(2000) + "🌱";
  setBrief(h, over);
  expect(textarea(h.view())!.props.value).toBe(over);
  expect(textarea(h.view())!.props["aria-invalid"]).toBe(true);
  expect(text(h.view())).toMatch(/4004\s+\/ 4000 UTF-8 bytes/);
  expect(button(h.view(), "Review own-subscription quote").props.disabled).toBe(
    true,
  );
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskQuote")).toBe(
    false,
  );
});
it("invalidates consent on every brief edit and rejects an already captured stale approval handler", async () => {
  const h = harness();
  h.props.privateLibrary = true;
  await h.choose();
  setBrief(h, "First focus");
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  const stale = button(h.view(), "Approve on my paired computer");
  setBrief(h, "Second focus");
  expect(button(h.view(), "Approve on my paired computer")).toBeUndefined();
  stale.props.onClick();
  await flush();
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
  await h.click("Review own-subscription quote");
  expect(button(h.view(), "Approve on my paired computer").props.disabled).toBe(
    true,
  );
});
it("does not resurrect an in-flight quote after the brief changes", async () => {
  const h = harness();
  h.props.privateLibrary = true;
  const base = h.calls.getMockImplementation()!;
  let release: (() => void) | undefined;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    if (op === "localTaskQuote")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return base(op, args);
  });
  await h.choose();
  setBrief(h, "First focus");
  button(h.view(), "Review own-subscription quote").props.onClick();
  await flush();
  setBrief(h, "Changed focus");
  release!();
  await flush();
  expect(button(h.view(), "Approve on my paired computer")).toBeUndefined();
  expect(text(h.view())).not.toContain("Review this exact request");
});
it("rejects a quote that does not bind the exact private brief", async () => {
  const h = harness();
  h.props.privateLibrary = true;
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    const result = await base(op, args);
    return op === "localTaskQuote"
      ? {
          ...result,
          payload: {
            ...result.payload,
            privateEvaluationBrief: "Different focus",
          },
        }
      : result;
  });
  await h.choose();
  setBrief(h, "My exact focus");
  await h.click("Review own-subscription quote");
  expect(button(h.view(), "Approve on my paired computer")).toBeUndefined();
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
});
it("keeps inherited plan origin read-only and never sends a brief argument for a plan", async () => {
  const h = harness();
  h.props.privateLibrary = true;
  h.props.proposal = {
    id: "proposal",
    title: "Private proposal",
    version: 2,
    review: "accepted",
    privateEvaluationOrigin: privateOrigin,
  };
  delete h.props.source;
  expect(textarea(h.view())).toBeUndefined();
  expect(text(h.view())).toContain(
    "inherits the proposal's approved private focus",
  );
  await h.click("Load account choices");
  h.select(0, "owned-device");
  h.select(1, "actual-only");
  h.select(2, "xhigh");
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  await h.click("Approve on my paired computer");
  for (const [op, args] of h.calls.mock.calls)
    if (op === "localTaskQuote" || op === "localTaskApprove")
      expect(args).not.toHaveProperty("privateEvaluationBrief");
});
it("renders only origin labels in resumed task and status views without raw private text", async () => {
  const h = harness();
  h.calls.mockImplementation(async (op): Promise<any> => {
    const task = {
      id: "private-task",
      state: "completed",
      model: "actual-only",
      effort: "xhigh",
      privateEvaluationOrigin: privateOrigin,
      privateEvaluationBrief: "RAW_PRIVATE_DO_NOT_RENDER",
      proposalIds: [],
      evaluationIds: [],
      deadline: Date.now() + 1000,
    };
    if (op === "localTaskResume") return { items: [task], next: null };
    if (op === "localTaskStatus") return task;
    throw Error("Unexpected call");
  });
  await h.click("Find existing tasks");
  expect(text(h.view())).toContain("Private evaluation context");
  expect(text(h.view())).not.toContain("RAW_PRIVATE_DO_NOT_RENDER");
  await h.click("Open task status");
  expect(text(h.view())).toContain("Private evaluation context");
  expect(text(h.view())).not.toContain("RAW_PRIVATE_DO_NOT_RENDER");
});
function sourceHarness() {
  const h = harness();
  h.props.privateLibrary = true;
  h.props.sourceReanalysis = { available: true, expectedPrivateVersion: 2 };
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    const result = await base(op, args);
    if (op === "localTaskCapabilities")
      return result.map((item: any) => ({
        ...item,
        admittedRuntime: {
          value: {
            schemaVersion: "local-task-runtime-v1",
            features: ["source_reanalysis_text_v1"],
          },
          hash: "a".repeat(64),
          profileBinding: "b".repeat(64),
          expiresAt: Date.now() + 300000,
          sessionExpiresAt: Date.now() + 3600000,
        },
      }));
    if (op === "localTaskQuote")
      return {
        ...result,
        payload: {
          sourceId: args.sourceId,
          expectedPrivateVersion: args.expectedPrivateVersion,
          ...(args.privateSourceBrief !== undefined
            ? { privateSourceBrief: args.privateSourceBrief }
            : {}),
        },
      };
    return result;
  });
  const chooseSource = async () => {
    await h.click("Load account choices");
    h.select(0, "owned-device");
    h.select(1, "actual-only");
    h.select(2, "xhigh");
  };
  return { ...h, chooseSource };
}
it("source text mode binds only exact source version/context without project or plan selectors", async () => {
  const h = sourceHarness();
  await h.chooseSource();
  const brief = "  Inspect this text focus.\nKeep spacing.  ";
  setBrief(h, brief);
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  await h.click("Approve on my paired computer");
  for (const [op, args] of h.calls.mock.calls)
    if (op === "localTaskQuote" || op === "localTaskApprove") {
      expect(args).toMatchObject({
        workload: "source_reanalysis_text",
        sourceId: "source",
        expectedPrivateVersion: 2,
        privateSourceBrief: brief,
        deviceId: "owned-device",
        model: "actual-only",
        effort: "xhigh",
      });
      for (const field of [
        "repositoryIds",
        "members",
        "proposalId",
        "proposalVersion",
        "privateEvaluationBrief",
      ])
        expect(args).not.toHaveProperty(field);
    }
  expect(OwnPlanTaskControls(h.props).key).toContain(":source-text-v2:2");
});
it.each(["missing", "expired", "old feature"])(
  "keeps %s text runtime unavailable without forcing sign-in",
  async (condition) => {
    const h = sourceHarness();
    const base = h.calls.getMockImplementation()!;
    h.calls.mockImplementation(async (op, args): Promise<any> => {
      const result = await base(op, args);
      if (op === "localTaskCapabilities")
        return result.map((item: any) => ({
          ...item,
          admittedRuntime:
            condition === "missing"
              ? null
              : {
                  ...item.admittedRuntime,
                  ...(condition === "expired"
                    ? { expiresAt: Date.now() - 1 }
                    : {
                        value: {
                          schemaVersion: "local-task-runtime-v1",
                          features: [],
                        },
                      }),
                },
        }));
      return result;
    });
    await h.chooseSource();
    expect(
      button(h.view(), "Review own-subscription quote").props.disabled,
    ).toBe(true);
    expect(text(h.view())).toContain("text runtime update required");
    expect(h.calls.mock.calls.some(([op]) => op === "localTaskQuote")).toBe(
      false,
    );
  },
);
it("source mode omits an empty brief and invalidates late quotes and stale approval after edits", async () => {
  const h = sourceHarness();
  await h.chooseSource();
  await h.click("Review own-subscription quote");
  expect(
    h.calls.mock.calls.find(([op]) => op === "localTaskQuote")![1],
  ).not.toHaveProperty("privateSourceBrief");
  consentToQuote(h);
  const old = button(h.view(), "Approve on my paired computer");
  setBrief(h, "New focus");
  old.props.onClick();
  await flush();
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
  await h.click("Review own-subscription quote");
  expect(button(h.view(), "Approve on my paired computer").props.disabled).toBe(
    true,
  );
});
it("source mode refuses an expired admitted runtime at the actual approval event", async () => {
  const h = sourceHarness();
  const now = Date.now();
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    const result = await base(op, args);
    return op === "localTaskCapabilities"
      ? result.map((item: any) => ({
          ...item,
          admittedRuntime: { ...item.admittedRuntime, expiresAt: now + 1000 },
        }))
      : result;
  });
  await h.chooseSource();
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  const approve = button(h.view(), "Approve on my paired computer");
  vi.spyOn(Date, "now").mockReturnValue(now + 1001);
  approve.props.onClick();
  await flush();
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
});
it("source history explicitly selects its workload and opens only a chosen result run", async () => {
  const h = sourceHarness();
  const viewResult = vi.fn();
  h.props.onViewPrivateResult = viewResult;
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> =>
    op === "localTaskResume"
      ? {
          items: [
            {
              id: "history-run",
              workload: "source_reanalysis_text",
              state: "completed",
              model: "actual-only",
              effort: "xhigh",
              privateVersion: 1,
              resultAvailable: true,
            },
          ],
          next: null,
        }
      : base(op, args),
  );
  await h.click("Find existing tasks");
  expect(h.calls).toHaveBeenCalledWith("localTaskResume", {
    organizationId: "org",
    sourceId: "source",
    cursor: null,
    workload: "source_reanalysis_text",
  });
  expect(viewResult).not.toHaveBeenCalled();
  await h.click("View private result version 1");
  expect(viewResult).toHaveBeenCalledExactlyOnceWith("history-run");
});
function variantHarness() {
  const h = harness();
  h.props.privateLibrary = true;
  h.props.privateVariantSelection = {
    schemaVersion: "private-source-variant-v1",
    runId: "earned-run" as any,
    version: 4,
    outputHash: "c".repeat(64),
    insightIds: ["idea-a", "idea-z"],
  };
  h.props.privateVariantReadUntil = Date.now() + 60000;
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    const value = await base(op, args);
    if (op === "localTaskCapabilities")
      return value.map((item: any) => ({
        ...item,
        admittedRuntime: {
          value: {
            schemaVersion: "local-task-runtime-v1",
            features: [
              "source_reanalysis_text_v1",
              "project_private_variant_v1",
              "project_apply_source_v1",
            ],
          },
          hash: "d".repeat(64),
          profileBinding: "e".repeat(64),
          expiresAt: Date.now() + 300000,
          sessionExpiresAt: Date.now() + 3600000,
        },
      }));
    if (op === "localTaskQuote")
      return {
        ...value,
        payload: {
          ...value.payload,
          privateVariantSelection: args.privateVariantSelection,
        },
      };
    return value;
  });
  return h;
}
it("quotes and approves private variant references through existing project controls without extra brief or client result text", async () => {
  const h = variantHarness();
  await h.choose();
  expect(textarea(h.view())).toBeUndefined();
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  await h.click("Approve on my paired computer");
  for (const [op, args] of h.calls.mock.calls)
    if (op === "localTaskQuote" || op === "localTaskApprove") {
      expect(args).toMatchObject({
        workload: "project_evaluation",
        sourceId: "source",
        repositoryIds: ["repo"],
        privateVariantSelection: h.props.privateVariantSelection,
      });
      for (const field of [
        "members",
        "privateEvaluationBrief",
        "privateSourceBrief",
        "summary",
        "claim",
        "interpretation",
      ])
        expect(args).not.toHaveProperty(field);
    }
});
it("separates private variant keys/history and rejects a changed quote echo", async () => {
  const h = variantHarness();
  const originalKey = OwnPlanTaskControls(h.props).key;
  expect(
    OwnPlanTaskControls({
      ...h.props,
      privateVariantSelection: {
        ...h.props.privateVariantSelection!,
        insightIds: ["idea-a"],
      },
    }).key,
  ).not.toBe(originalKey);
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> =>
    op === "localTaskResume"
      ? { items: [], next: null }
      : op === "localTaskQuote"
        ? {
            ...(await base(op, args)),
            payload: {
              privateVariantSelection: {
                ...args.privateVariantSelection,
                insightIds: ["other"],
              },
            },
          }
        : base(op, args),
  );
  await h.click("Find existing tasks");
  expect(h.calls).toHaveBeenCalledWith("localTaskResume", {
    organizationId: "org",
    sourceId: "source",
    cursor: null,
    privateVariantSelection: h.props.privateVariantSelection,
  });
  await h.choose();
  await h.click("Review own-subscription quote");
  expect(button(h.view(), "Approve on my paired computer")).toBeUndefined();
});
it("requires the private-project runtime feature and checks result rights expiry again at approval", async () => {
  const h = variantHarness();
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    const value = await base(op, args);
    return op === "localTaskCapabilities"
      ? value.map((item: any) => ({
          ...item,
          admittedRuntime: {
            ...item.admittedRuntime,
            value: {
              ...item.admittedRuntime.value,
              features: ["source_reanalysis_text_v1"],
            },
          },
        }))
      : value;
  });
  await h.choose();
  expect(button(h.view(), "Review own-subscription quote").props.disabled).toBe(
    true,
  );
  h.calls.mockImplementation(base);
  await h.choose();
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  const approve = button(h.view(), "Approve on my paired computer");
  vi.spyOn(Date, "now").mockReturnValue(h.props.privateVariantReadUntil! + 1);
  approve.props.onClick();
  await flush();
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
});
it("labels inherited private-variant plans without allowing a caller-selected variant or extra brief", async () => {
  const h = harness();
  h.props.privateLibrary = true;
  delete h.props.source;
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    const value = await base(op, args);
    return op === "localTaskCapabilities"
      ? value.map((item: any) => ({
          ...item,
          admittedRuntime: {
            value: {
              schemaVersion: "local-task-runtime-v1",
              features: ["project_private_variant_v1"],
            },
            hash: "d".repeat(64),
            profileBinding: "e".repeat(64),
            expiresAt: Date.now() + 300000,
            sessionExpiresAt: Date.now() + 3600000,
          },
        }))
      : value;
  });
  h.props.proposal = {
    id: "proposal",
    title: "Private variant proposal",
    version: 3,
    review: "accepted",
    privateEvaluationOrigin: {
      schemaVersion: "2.0.0",
      kind: "private_source_variant",
      ownerId: "owner" as any,
      sourceId: "source" as any,
      runId: "earned-run" as any,
      version: 4,
      outputHash: "a".repeat(64),
      baseHash: "b".repeat(64),
      briefHash: null,
      model: "actual-only",
      effort: "xhigh",
      insightIds: ["idea"],
    },
  };
  await h.click("Load account choices");
  h.select(0, "owned-device");
  h.select(1, "actual-only");
  h.select(2, "xhigh");
  expect(text(h.view())).toContain("Private source result version");
  expect(textarea(h.view())).toBeUndefined();
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  await h.click("Approve on my paired computer");
  for (const [op, args] of h.calls.mock.calls)
    if (op === "localTaskQuote" || op === "localTaskApprove") {
      expect(args.workload).toBe("plan_draft");
      expect(args).not.toHaveProperty("privateVariantSelection");
      expect(args).not.toHaveProperty("privateEvaluationBrief");
    }
});
it("fences a captured variant approval handler and pending quote after controls unmount on a changed selection", async () => {
  const h = variantHarness();
  await h.choose();
  await h.click("Review own-subscription quote");
  consentToQuote(h);
  const staleApprove = button(h.view(), "Approve on my paired computer");
  hooks.cleanup!();
  staleApprove.props.onClick();
  await flush();
  expect(h.calls.mock.calls.some(([op]) => op === "localTaskApprove")).toBe(
    false,
  );
});
it("ignores a pending private-variant quote after its selection controls unmount", async () => {
  const h = variantHarness();
  await h.choose();
  const base = h.calls.getMockImplementation()!;
  let release: (() => void) | undefined;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    if (op === "localTaskQuote")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return base(op, args);
  });
  button(h.view(), "Review own-subscription quote").props.onClick();
  await flush();
  hooks.cleanup!();
  release!();
  await flush();
  expect(button(h.view(), "Approve on my paired computer")).toBeUndefined();
});
it("compares private quote selection fields independently of object property order", async () => {
  const h = variantHarness();
  const base = h.calls.getMockImplementation()!;
  h.calls.mockImplementation(async (op, args): Promise<any> => {
    const value = await base(op, args);
    if (op !== "localTaskQuote") return value;
    const selection = args.privateVariantSelection;
    return {
      ...value,
      payload: {
        ...value.payload,
        privateVariantSelection: {
          insightIds: selection.insightIds,
          outputHash: selection.outputHash,
          version: selection.version,
          runId: selection.runId,
          schemaVersion: selection.schemaVersion,
        },
      },
    };
  });
  await h.choose();
  await h.click("Review own-subscription quote");
  expect(button(h.view(), "Approve on my paired computer")).toBeDefined();
});
