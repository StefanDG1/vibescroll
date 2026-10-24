import { afterEach, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hooks = vi.hoisted(() => ({
  values: [] as any[],
  index: 0,
  real: false,
  effects: [] as (() => unknown)[],
  mounted: false,
  effectIndex: 0,
  effectStates: [] as { deps: unknown[]; cleanup?: () => void }[],
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useEffect: (effect: () => unknown, deps: unknown[]) => {
      const index = hooks.effectIndex++;
      const old = hooks.effectStates[index];
      if (
        !old ||
        deps.some((value, position) => !Object.is(value, old.deps[position]))
      ) {
        old?.cleanup?.();
        const next = { deps, cleanup: undefined as (() => void) | undefined };
        hooks.effectStates[index] = next;
        hooks.effects.push(() => {
          const cleanup = effect();
          next.cleanup =
            typeof cleanup === "function" ? (cleanup as () => void) : undefined;
          return cleanup;
        });
      }
    },
    useId: () => "private-test",
    useRef: (value: unknown) => {
      if (hooks.real) return real.useRef(value);
      const index = hooks.index++;
      return (hooks.values[index] ??= { current: value });
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
  PrivateSourceAnalysis,
  PrivateSourceAnalysisPanel,
  type PrivateSourceAnalysisProps,
} from "./components/private-source-analysis";
import { OwnPlanTaskControls } from "./components/own-plan-task-controls";
import { TypedSourceEvidence } from "./components/typed-source-evidence";
const downloads = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./lib/download", () => ({ downloadText: downloads.save }));
type Node = ReactElement<Record<string, any>>;
let cleanups: (() => void)[] = [];
function elements(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (isValidElement(value)) return text((value as Node).props.children);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function button(tree: unknown, label: string) {
  return elements(tree).find(
    (node) => node.type === "button" && text(node) === label,
  )!;
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function result(retained = false) {
  return {
    available: true,
    readUntil: null,
    version: 1,
    output: {
      schemaVersion: retained ? "2.0.0" : "1.0.0",
      sourceId: "source",
      processingRunId: "completed-run",
      coverage: retained ? "source_text" : "caption_only",
      summary: "Private summary",
      warnings: ["Check the original context."],
      insights: [
        {
          id: "idea",
          title: "A cited idea",
          claim: "Source claim",
          interpretation: "Private interpretation",
          categories: ["product_design"],
          evidence: [
            {
              id: "text",
              kind: retained ? "supplied_text" : "user_note",
              startMs: null,
              endMs: null,
            },
          ],
          confidence: "uncertain",
          verificationNeeds: ["Verify fit"],
        },
      ],
      ...(retained
        ? { sourceRevisionId: "revision", sourceContentHash: "b".repeat(64) }
        : {}),
    },
    provenance: {
      runId: "completed-run",
      model: "chosen-model",
      effort: "high",
      inputKind: retained ? "retained_text" : "supplied_text",
      completedAt: 1700000000000,
      outputHash: "a".repeat(64),
    },
  };
}
function harness() {
  const call = vi.fn(
    async (_op: string, _args: Record<string, unknown>): Promise<any> =>
      result(),
  );
  const props: PrivateSourceAnalysisProps = {
    privateLibrary: true,
    organizationId: "org",
    sourceId: "source",
    title: "Owned text",
    generation: 3,
    sourceUpdatedAt: 1700000000000,
    rightsAttested: true,
    eligibility: {
      available: false,
      currentPrivateVersion: 1,
      pendingRunId: null,
      inputKind: "supplied_text",
      reason: "unavailable",
    },
    call,
    disabled: true,
    onOpenOriginal: vi.fn(),
  };
  function view() {
    hooks.index = 0;
    hooks.effectIndex = 0;
    const tree = PrivateSourceAnalysisPanel(props);
    for (const effect of hooks.effects.splice(0)) {
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
    }
    return tree;
  }
  async function load() {
    button(view(), "Load private text result").props.onClick();
    await flush();
  }
  return { props, call, view, load };
}
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  hooks.values = [];
  hooks.index = 0;
  hooks.real = false;
  hooks.effects = [];
  hooks.mounted = false;
  hooks.effectStates = [];
  hooks.effectIndex = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  downloads.save.mockReset();
});
it("SSR is readable with explicit result loading and makes no request or processing call on mount", () => {
  const h = harness();
  hooks.real = true;
  const html = renderToStaticMarkup(
    createElement(PrivateSourceAnalysis, h.props),
  );
  expect(html).toContain("Private text reanalysis");
  expect(html).toContain("Load private text result");
  expect(html).not.toContain("Private summary");
  expect(h.call).not.toHaveBeenCalled();
});
it("loads an earned private result explicitly even when processing and runtime choices are unavailable", async () => {
  const h = harness();
  h.view();
  expect(h.call).not.toHaveBeenCalled();
  expect(button(h.view(), "Load private text result").props.disabled).toBe(
    false,
  );
  await h.load();
  expect(h.call).toHaveBeenCalledExactlyOnceWith(
    "privateSourceAnalysisDetail",
    { sourceId: "source" },
  );
  expect(text(h.view())).toContain("Private summary");
  expect(text(h.view())).toContain("AI-generated analysis may contain errors");
  const original = elements(h.view()).find(
    (node) => node.type === "a" && node.props.href === "#source-transcript",
  )!;
  original.props.onClick();
  expect(h.props.onOpenOriginal).toHaveBeenCalledOnce();
  expect(text(h.view())).not.toMatch(/0–0|Apply to project|full video/);
});
it("keeps the prior completed result while a request is pending, then clears unavailable or denied results", async () => {
  const h = harness();
  await h.load();
  h.props.eligibility.pendingRunId = "new-run";
  expect(text(h.view())).toContain("Private summary");
  expect(text(h.view())).toContain("previous completed result");
  h.call.mockResolvedValueOnce({
    available: false,
    readUntil: null,
    version: null,
    output: null,
    provenance: null,
  });
  await h.load();
  expect(text(h.view())).not.toContain("Private summary");
  h.call.mockRejectedValueOnce(Error("Access denied"));
  await h.load();
  expect(text(h.view())).not.toContain("Private summary");
});
it("loads history only after an explicit chosen run and exports no raw brief", async () => {
  const h = harness();
  const controls = elements(h.view()).find(
    (node) => node.type === OwnPlanTaskControls,
  )!;
  controls.props.onViewPrivateResult("completed-run");
  await flush();
  expect(h.call).toHaveBeenCalledExactlyOnceWith(
    "privateSourceAnalysisDetail",
    { sourceId: "source", runId: "completed-run" },
  );
  button(h.view(), "Export private result JSON").props.onClick();
  expect(downloads.save).toHaveBeenCalledOnce();
  const exported = JSON.parse(downloads.save.mock.calls[0][1]);
  expect(exported).toHaveProperty("output.summary", "Private summary");
  expect(exported).not.toHaveProperty("privateSourceBrief");
});
it("ignores a late older selection and clears data when another source is returned", async () => {
  const h = harness();
  let release: ((value: unknown) => void) | undefined;
  h.call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  button(h.view(), "Load private text result").props.onClick();
  await flush();
  elements(h.view())
    .find((node) => node.type === OwnPlanTaskControls)!
    .props.onViewPrivateResult("completed-run");
  await flush();
  release!({
    ...result(),
    output: { ...result().output, summary: "LATE_OLD_RESULT" },
  });
  await flush();
  expect(text(h.view())).toContain("Private summary");
  expect(text(h.view())).not.toContain("LATE_OLD_RESULT");
  h.call.mockResolvedValueOnce({
    ...result(),
    output: { ...result().output, sourceId: "other" },
  });
  await h.load();
  expect(text(h.view())).not.toContain("Private summary");
});
it("fences unmounted replies and changes inner scope for workspace, source, generation and private version", async () => {
  const h = harness();
  let release: ((value: unknown) => void) | undefined;
  h.call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  button(h.view(), "Load private text result").props.onClick();
  await flush();
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  release!(result());
  await flush();
  expect(text(h.view())).not.toContain("Private summary");
  const key = PrivateSourceAnalysis(h.props)!.key;
  for (const change of [
    { organizationId: "other" },
    { sourceId: "other" },
    { generation: 4 },
    { eligibility: { ...h.props.eligibility, currentPrivateVersion: 2 } },
  ])
    expect(PrivateSourceAnalysis({ ...h.props, ...change })!.key).not.toBe(key);
});
it("reuses retained evidence with a separate ID prefix and no invented time ranges", async () => {
  const h = harness();
  h.call.mockResolvedValueOnce(result(true));
  h.props.evidenceRegistry = [
    {
      id: "text",
      kind: "supplied_text",
      excerpt: "Actual retained excerpt",
      excerptHash: "a".repeat(64),
      canonicalUrl: "https://example.test",
      observedAt: 1700000000000,
      originalUrl: null,
      startOffset: 0,
      endOffset: 23,
      provenance: "user_supplied_unverified",
    },
  ];
  await h.load();
  const evidence = elements(h.view()).find(
    (node) => node.type === TypedSourceEvidence,
  )!;
  expect(evidence.props.idPrefix).toBe("private-evidence-private-test");
  expect(evidence.props.evidenceRegistry).toEqual(h.props.evidenceRegistry);
  expect(
    elements(h.view()).some(
      (node) => node.props.href === "#private-evidence-private-test-text",
    ),
  ).toBe(true);
  const html = renderToStaticMarkup(evidence);
  expect(html).toContain("Actual retained excerpt");
  expect(html).toContain('id="private-evidence-private-test-text"');
  expect(html).not.toContain("0–0");
  expect(
    renderToStaticMarkup(
      createElement(TypedSourceEvidence, {
        evidenceRegistry: h.props.evidenceRegistry!,
      }),
    ),
  ).toContain('id="evidence-text"');
});
it("rejects malformed result payloads instead of claiming model success", async () => {
  const h = harness();
  h.call.mockResolvedValueOnce({
    ...result(),
    privateSourceBrief: "RAW_CONTEXT",
    output: { summary: "Unvalidated result" },
  });
  await h.load();
  expect(text(h.view())).not.toContain("Unvalidated result");
  expect(text(h.view())).not.toContain("RAW_CONTEXT");
  expect(text(h.view())).toContain("could not be loaded");
});
it("requires explicit owner-private scope locally and never queries results for a team/default mount", async () => {
  const h = harness();
  h.props.privateLibrary = false;
  expect(PrivateSourceAnalysis(h.props)).toBeNull();
  await h.load();
  expect(h.call).not.toHaveBeenCalled();
  expect(text(h.view())).not.toContain("Private summary");
});
it("canonical updatedAt-only changes hide loaded data/export and fence an in-flight read", async () => {
  const h = harness();
  await h.load();
  const staleExport = button(h.view(), "Export private result JSON");
  const key = PrivateSourceAnalysis(h.props)!.key;
  h.props.sourceUpdatedAt += 1;
  expect(PrivateSourceAnalysis(h.props)!.key).not.toBe(key);
  expect(text(h.view())).not.toContain("Private summary");
  expect(button(h.view(), "Export private result JSON")).toBeUndefined();
  staleExport.props.onClick();
  expect(downloads.save).not.toHaveBeenCalled();
  let release: ((value: unknown) => void) | undefined;
  h.call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  button(h.view(), "Load private text result").props.onClick();
  await flush();
  h.props.sourceUpdatedAt += 1;
  release!(result());
  await flush();
  expect(text(h.view())).not.toContain("Private summary");
});
it("rights and retention changes clear private data without making execution availability a read gate", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.props.sourceRetentionUntil = Date.now() + 1000;
  await h.load();
  let tree = h.view();
  expect(h.props.eligibility.available).toBe(false);
  expect(text(tree)).toContain("Private summary");
  const exportBeforeRevocation = button(tree, "Export private result JSON");
  h.props.rightsAttested = false;
  expect(text(h.view())).not.toContain("Private summary");
  exportBeforeRevocation.props.onClick();
  expect(downloads.save).not.toHaveBeenCalled();
  h.props.rightsAttested = true;
  h.props.sourceRetentionUntil = Date.now() + 2000;
  expect(text(h.view())).not.toContain("Private summary");
  await h.load();
  tree = h.view();
  expect(text(tree)).toContain("Private summary");
  const exportBeforeExpiry = button(tree, "Export private result JSON");
  await vi.advanceTimersByTimeAsync(2000);
  expect(text(h.view())).not.toContain("Private summary");
  exportBeforeExpiry.props.onClick();
  expect(downloads.save).not.toHaveBeenCalled();
  expect(button(h.view(), "Load private text result").props.disabled).toBe(
    true,
  );
});
it("caps long local expiry timers without clearing valid earned reads early and cleans them on unmount", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.props.sourceRetentionUntil = Date.now() + 2_147_483_647 + 1000;
  await h.load();
  h.view();
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(2_147_483_647);
  expect(text(h.view())).toContain("Private summary");
  expect(vi.getTimerCount()).toBe(1);
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  expect(vi.getTimerCount()).toBe(0);
});
it("binds retained revision rights metadata independently of processing eligibility", async () => {
  const h = harness();
  h.props.sourceRevision = {
    schemaVersion: "1.0.0",
    sourceType: "supplied_text",
    canonical: "text",
    providerIdentity: "supplied",
    contentHash: "a".repeat(64),
    adapterVersion: "supplied-v1",
    observedAt: 1700000000000,
    rightsBasis: "owner supplied",
    retention: {
      retainUntil: Date.now() + 5000,
      deletionWithinMs: 1000,
      policyEvidenceId: "policy",
    },
    coverage: {
      method: "supplied_text",
      retrieved: 1,
      omitted: 0,
      omissions: [],
    },
  };
  await h.load();
  const originalKey = PrivateSourceAnalysis(h.props)!.key;
  expect(text(h.view())).toContain("Private summary");
  h.props.sourceRevision = {
    ...h.props.sourceRevision,
    rightsBasis: "changed policy",
  };
  expect(PrivateSourceAnalysis(h.props)!.key).not.toBe(originalKey);
  expect(text(h.view())).not.toContain("Private summary");
  await h.load();
  expect(text(h.view())).toContain("Private summary");
  h.props.sourceRevision = {
    ...h.props.sourceRevision,
    retention: {
      ...h.props.sourceRevision.retention!,
      retainUntil: Date.now() - 1,
    },
  };
  expect(text(h.view())).not.toContain("Private summary");
});
it("uses the earlier server-derived deadline for visible results/export and rejects already-expired available responses", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.props.sourceRetentionUntil = Date.now() + 10000;
  h.call.mockResolvedValueOnce({ ...result(), readUntil: Date.now() + 1000 });
  await h.load();
  const oldExport = button(h.view(), "Export private result JSON");
  expect(text(h.view())).toContain("Private summary");
  await vi.advanceTimersByTimeAsync(1000);
  expect(text(h.view())).not.toContain("Private summary");
  oldExport.props.onClick();
  expect(downloads.save).not.toHaveBeenCalled();
  h.call.mockResolvedValueOnce({ ...result(), readUntil: Date.now() - 1 });
  await h.load();
  expect(text(h.view())).not.toContain("Private summary");
});
it("rejects a private result whose output processing run differs from its provenance", async () => {
  const h = harness();
  h.call.mockResolvedValueOnce({
    ...result(),
    output: { ...result().output, processingRunId: "wrong-run" },
  });
  await h.load();
  expect(text(h.view())).not.toContain("Private summary");
  expect(button(h.view(), "Export private result JSON")).toBeUndefined();
});
