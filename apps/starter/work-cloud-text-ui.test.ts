import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hooks = vi.hoisted(() => ({
  real: false,
  cells: [] as any[],
  index: 0,
  effectIndex: 0,
  effects: [] as {
    deps: unknown[];
    cleanup?: () => void;
    run?: () => unknown;
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
    useEffect: (run: () => unknown, deps: unknown[]) => {
      if (hooks.real) return real.useEffect(run as () => void, deps);
      const index = hooks.effectIndex++;
      const old = hooks.effects[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        old?.cleanup?.();
        hooks.effects[index] = { deps, run };
      }
    },
  };
});
import {
  WorkCloudText,
  WorkCloudTextPanel,
  type WorkCloudTextProps,
} from "./components/work-cloud-text";
type Node = ReactElement<Record<string, any>>;
const now = 1_800_000_000_000;
const grant = {
  id: "grant-one",
  clientId: "official-host",
  version: 2,
  state: "active",
  scopes: ["analysis:execute"],
  expiresAt: now + 600000,
};
const setup = { enabled: true, workCloudTextEnabled: true, grants: [grant] };
const preview = {
  sourceId: "source-one",
  generation: 3,
  approvedGeneration: 4,
  grantId: grant.id,
  grantVersion: grant.version,
  inputHash: "a".repeat(64),
  policyHash: "b".repeat(64),
  inputKind: "source_text",
  inputCharacters: 73,
  maxApiUsd: 0,
  mediaSupported: false,
};
const queued = {
  sourceId: "source-one",
  generation: 4,
  state: "queued",
  expiresAt: now + 900000,
  inputHash: preview.inputHash,
};
const base = {
  sourceId: "source-one",
  organizationId: "private",
  generation: 3,
  revision: 12,
};
function render(props: WorkCloudTextProps) {
  hooks.index = 0;
  hooks.effectIndex = 0;
  const tree = WorkCloudTextPanel(props);
  for (const effect of hooks.effects)
    if (effect.run) {
      const cleanup = effect.run();
      effect.run = undefined;
      effect.cleanup =
        typeof cleanup === "function" ? (cleanup as () => void) : undefined;
    }
  return tree;
}
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
function button(tree: unknown, name: string) {
  const node = elements(tree).find(
    (item) => item.type === "button" && text(item) === name,
  );
  expect(node, name).toBeDefined();
  return node!;
}
function input(tree: unknown, type: string) {
  const node = elements(tree).find(
    (item) => item.type === "input" && item.props.type === type,
  );
  expect(node, type).toBeDefined();
  return node!;
}
function select(tree: unknown, label: string) {
  const node = elements(tree).find(
    (item) => item.type === "label" && text(item).startsWith(label),
  );
  expect(node, label).toBeDefined();
  return elements(node).find((item) => item.type === "select")!;
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function click(tree: unknown, label: string) {
  button(tree, label).props.onClick();
  await flush();
}
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function callFixture() {
  return vi.fn(async (operation: string) =>
    operation === "assistantSetup"
      ? setup
      : operation === "workCloudTextPreview"
        ? preview
        : queued,
  );
}
async function prepare(props: WorkCloudTextProps) {
  await click(render(props), "Review Work Cloud text");
  select(render(props), "Assistant connection").props.onChange({
    target: { value: grant.id },
  });
  await click(render(props), "Preview text approval");
}
function configure(props: WorkCloudTextProps) {
  input(render(props), "text").props.onChange({
    target: { value: "supported-host-model" },
  });
  select(render(props), "Requested reasoning effort").props.onChange({
    target: { value: "medium" },
  });
  input(render(props), "checkbox").props.onChange({
    target: { checked: true },
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.real = false;
  hooks.cells = [];
  hooks.effects = [];
  hooks.index = 0;
  hooks.effectIndex = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("server-renders with actual React hooks, no mount request and truthful experimental text-only boundaries", () => {
  hooks.real = true;
  const call = callFixture();
  const html = renderToStaticMarkup(
    createElement(WorkCloudText, { ...base, call }),
  );
  expect(html).toContain("Experimental Work Cloud text");
  expect(html).toContain("does not process video");
  expect(html).toContain("not published to the catalog");
  expect(html).not.toContain("work_cloud_claim");
  expect(call).not.toHaveBeenCalled();
});
it("keys source, workspace, generation, revision and disabled state while keeping callback identity irrelevant", () => {
  const call = callFixture();
  const first = WorkCloudText({ ...base, call });
  for (const change of [
    { sourceId: "other" },
    { organizationId: "other" },
    { generation: 4 },
    { revision: 13 },
    { disabled: true },
  ])
    expect(WorkCloudText({ ...base, ...change, call }).key).not.toBe(first.key);
  expect(WorkCloudText({ ...base, call: callFixture() }).key).toBe(first.key);
});
it("fetches grants only after review and filters active permission/expiry without choosing a grant", async () => {
  const call = vi.fn().mockResolvedValue({
    ...setup,
    grants: [
      grant,
      { ...grant, id: "revoked", state: "revoked" },
      { ...grant, id: "expired", expiresAt: now },
      { ...grant, id: "wrong-scope", scopes: ["analysis:request"] },
      { ...grant, id: "until-revoked", expiresAt: null },
    ],
  });
  const props = { ...base, call };
  render(props);
  expect(call).not.toHaveBeenCalled();
  await click(render(props), "Review Work Cloud text");
  const tree = render(props);
  expect(select(tree, "Assistant connection").props.value).toBe("");
  expect(text(tree)).toContain("until-revoked");
  expect(text(tree)).not.toContain("wrong-scope");
  expect(text(tree)).not.toContain("grant expired");
  expect(button(tree, "Preview text approval").props.disabled).toBe(true);
  expect(call).toHaveBeenCalledWith("assistantSetup", {
    organizationId: base.organizationId,
  });
});
it.each(["enabled", "workCloudTextEnabled"])(
  "denies when setup.%s is false and allows a fresh manual review",
  async (field) => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ ...setup, [field]: false })
      .mockResolvedValueOnce(setup);
    const props = { ...base, call };
    await click(render(props), "Review Work Cloud text");
    expect(text(render(props))).toContain("approval could not be confirmed");
    await click(render(props), "Review Work Cloud text");
    expect(select(render(props), "Assistant connection")).toBeDefined();
  },
);
it.each([
  { generation: 2 },
  { approvedGeneration: 9 },
  { sourceId: "foreign" },
  { grantId: "foreign" },
  { grantVersion: 99 },
  { inputHash: "invalid" },
  { mediaSupported: true },
  { maxApiUsd: 1 },
])("rejects mismatched or unsupported preview %j", async (change) => {
  const call = vi.fn(async (operation) =>
    operation === "assistantSetup" ? setup : { ...preview, ...change },
  );
  const props = { ...base, call };
  await prepare(props);
  expect(text(render(props))).toContain("approval could not be confirmed");
  expect(
    elements(render(props)).some(
      (node) => node.props["aria-label"] === "Exact text approval preview",
    ),
  ).toBe(false);
  expect(call).toHaveBeenCalledTimes(2);
});
it("requires model, effort and exact own-plan consent before exact-argument approval and handoff", async () => {
  const call = callFixture();
  const props = { ...base, call };
  await prepare(props);
  expect(input(render(props), "text").props.value).toBe("");
  expect(select(render(props), "Requested reasoning effort").props.value).toBe(
    "",
  );
  expect(input(render(props), "checkbox").props.disabled).toBe(true);
  configure(props);
  const approvedButton = button(render(props), "Approve one text analysis");
  await click(render(props), "Approve one text analysis");
  expect(call.mock.calls[2]).toEqual([
    "workCloudTextApprove",
    {
      sourceId: base.sourceId,
      generation: 3,
      grantId: grant.id,
      grantVersion: 2,
      expectedInputHash: preview.inputHash,
      model: "supported-host-model",
      effort: "medium",
      useOwnPlan: true,
      maxApiUsd: 0,
    },
  ]);
  const tree = render(props);
  const instructions = elements(tree).find((node) => node.type === "textarea")!;
  expect(instructions.props.readOnly).toBe(true);
  expect(instructions.props.value).toContain(
    "work_cloud_claim for sourceId source-one and generation 4",
  );
  expect(instructions.props.value).toContain("actual current host task ID");
  expect(text(tree)).toContain("not a completed analysis");
  await vi.advanceTimersByTimeAsync(900000);
  approvedButton.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(3);
});
it("clears consent when model or effort changes and fences a previously captured approval handler", async () => {
  const call = callFixture();
  const props = { ...base, call };
  await prepare(props);
  configure(props);
  const oldApprove = button(render(props), "Approve one text analysis");
  input(render(props), "text").props.onChange({
    target: { value: "changed-host-model" },
  });
  expect(input(render(props), "checkbox").props.checked).toBe(false);
  oldApprove.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(2);
  input(render(props), "checkbox").props.onChange({
    target: { checked: true },
  });
  select(render(props), "Requested reasoning effort").props.onChange({
    target: { value: "high" },
  });
  expect(input(render(props), "checkbox").props.checked).toBe(false);
});
it("drops an in-flight preview after grant selection changes and after unmount", async () => {
  const response = deferred();
  const call = vi
    .fn()
    .mockResolvedValueOnce({
      ...setup,
      grants: [grant, { ...grant, id: "second" }],
    })
    .mockReturnValueOnce(response.promise);
  const props = { ...base, call };
  await click(render(props), "Review Work Cloud text");
  select(render(props), "Assistant connection").props.onChange({
    target: { value: grant.id },
  });
  await click(render(props), "Preview text approval");
  select(render(props), "Assistant connection").props.onChange({
    target: { value: "second" },
  });
  response.resolve(preview);
  await flush();
  expect(
    elements(render(props)).some(
      (node) => node.props["aria-label"] === "Exact text approval preview",
    ),
  ).toBe(false);
  const later = deferred();
  call.mockReturnValueOnce(later.promise);
  await click(render(props), "Preview text approval");
  for (const effect of hooks.effects) effect.cleanup?.();
  later.resolve({ ...preview, grantId: "second" });
  await flush();
  expect(
    hooks.cells.some((value) => value?.inputHash === preview.inputHash),
  ).toBe(false);
});
it("rejects an expired grant at submission even if the earlier checkbox was approved", async () => {
  const call = callFixture();
  const props = { ...base, call };
  await prepare(props);
  configure(props);
  await vi.advanceTimersByTimeAsync(600000);
  await click(render(props), "Approve one text analysis");
  expect(call).toHaveBeenCalledTimes(2);
  expect(text(render(props))).toContain("Review the current connection");
});
it("denies a stale queued receipt and clears preview/consent on approval failure", async () => {
  const call = vi.fn(async (operation) =>
    operation === "assistantSetup"
      ? setup
      : operation === "workCloudTextPreview"
        ? preview
        : { ...queued, generation: 30 },
  );
  const props = { ...base, call };
  await prepare(props);
  configure(props);
  await click(render(props), "Approve one text analysis");
  expect(text(render(props))).toContain("approval could not be confirmed");
  expect(elements(render(props)).some((node) => node.type === "textarea")).toBe(
    false,
  );
});

it.each(["ultra", "not-supported"])(
  "refuses an injected unsupported effort %s",
  async (effort) => {
    const call = callFixture();
    const props = { ...base, call };
    await prepare(props);
    configure(props);
    select(render(props), "Requested reasoning effort").props.onChange({
      target: { value: effort },
    });
    input(render(props), "checkbox").props.onChange({
      target: { checked: true },
    });
    await click(render(props), "Approve one text analysis");
    expect(call).toHaveBeenCalledTimes(2);
    expect(text(render(props))).toContain("Review the current connection");
  },
);
