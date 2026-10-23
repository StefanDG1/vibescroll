import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const hooks = vi.hoisted(() => ({ values: [] as any[], index: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useId: () => "synthetic-personal-control",
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
import { PersonalSourceAnalysis } from "./components/console";
type Node = ReactElement<Record<string, any>>;
afterEach(() => {
  hooks.values = [];
  hooks.index = 0;
  vi.restoreAllMocks();
});
function render(props: any) {
  hooks.index = 0;
  return PersonalSourceAnalysis(props);
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
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function harness(extra: any = {}) {
  const call = vi.fn(async () => ({ approved: true }));
  const device = {
    _id: "owned-device",
    name: "My paired computer",
    personalOwned: true,
    personalOnline: true,
    state: "paired",
    personalModels: [{ slug: "legacy-only", displayName: "Legacy echo" }],
    subscriptionCapabilities: {
      hash: "current-capability-hash",
      expiresAt: Date.now() + 600000,
      sessionExpiresAt: Date.now() + 600000,
      value: {
        models: [
          {
            slug: "advertised-text",
            displayName: "Actual text model",
            inputModalities: ["text"],
            reasoningEfforts: ["xhigh"],
          },
          {
            slug: "advertised-image",
            displayName: "Actual image model",
            inputModalities: ["text", "image"],
            reasoningEfforts: ["medium"],
          },
        ],
      },
    },
  };
  const props = {
    source: {
      _id: "owned-source",
      kind: "text",
      generation: 7,
      state: "saved",
    },
    devices: [device],
    call,
    linkAnalysisEnabled: true,
    ...extra,
  };
  const view = () => render(props);
  function choose(index: number, value: string) {
    elements(view())
      .filter((node) => typeof node.props.onValueChange === "function")
      [index].props.onValueChange(value);
  }
  function consent() {
    elements(view())
      .find((node) => node.type === "input" && node.props.type === "checkbox")!
      .props.onChange({ target: { checked: true } });
  }
  return { props, device, call, view, choose, consent };
}
it("offers only actual advertised model modalities/efforts and binds explicit consent to the catalogue", async () => {
  const h = harness();
  h.choose(0, "owned-device");
  expect(text(h.view())).toContain("Actual text model");
  expect(text(h.view())).not.toContain("Legacy echo");
  h.choose(1, "advertised-text");
  expect(text(h.view())).toContain("xhigh");
  expect(text(h.view())).not.toContain("medium");
  h.choose(2, "xhigh");
  h.consent();
  const action = elements(h.view()).find(
    (node) => text(node) === "Analyze with my plan",
  )!;
  expect(action.props.disabled).toBe(false);
  await action.props.onClick();
  await flush();
  expect(h.call).toHaveBeenCalledWith("approvePersonalAnalysis", {
    id: "owned-source",
    generation: 7,
    deviceId: "owned-device",
    model: "advertised-text",
    effort: "xhigh",
    useOwnPlan: true,
  });
  h.consent();
  h.device.subscriptionCapabilities.hash = "changed-profile-catalogue";
  expect(
    elements(h.view()).find((node) => text(node) === "Analyze with my plan")!
      .props.disabled,
  ).toBe(true);
});
it("does not invent models or efforts when only a legacy echo exists", () => {
  const h = harness();
  delete (h.device as any).subscriptionCapabilities;
  h.choose(0, "owned-device");
  expect(text(h.view())).not.toContain("Legacy echo");
  expect(text(h.view())).toContain("No model or reasoning effort is assumed");
  expect(
    elements(h.view()).find((node) => text(node) === "Analyze with my plan")!
      .props.disabled,
  ).toBe(true);
});
it("excludes text-only models for actual media and rejects a catalogue that expired after consent", async () => {
  const h = harness({
    source: { _id: "video", kind: "upload", generation: 1, state: "saved" },
  });
  h.choose(0, "owned-device");
  expect(text(h.view())).not.toContain("Actual text model");
  expect(text(h.view())).toContain("Actual image model");
  h.choose(1, "advertised-image");
  h.choose(2, "medium");
  h.consent();
  const tree = h.view();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600001);
  await elements(tree)
    .find((node) => text(node) === "Transcribe and analyze video")!
    .props.onClick();
  await flush();
  // A delayed click still uses the current wall clock, even before the expiry timer re-renders.
  expect(h.call).not.toHaveBeenCalled();
});
it.each(["orderedPreparation", "orderedMedia", "serviceIntent"])(
  "blocks the legacy ordered route %s while preserving existing-job cancellation",
  async (field) => {
    const h = harness({
      source: {
        _id: "ordered",
        kind: "url",
        state: "saved",
        generation: 1,
        [field]: { state: "pending" },
      },
    });
    expect(text(h.view())).toContain(
      "Ordered-media analysis is awaiting its supported route",
    );
    expect(text(h.view())).not.toContain("Transcribe and analyze video");
    h.props.source.personalAnalysis = {
      state: "queued",
      model: "actual",
      effort: "medium",
    };
    const cancel = elements(h.view()).find(
      (node) => text(node) === "Cancel personal analysis",
    )!;
    expect(cancel).toBeDefined();
    await cancel.props.onClick();
    expect(h.call).toHaveBeenCalledWith("cancelPersonalAnalysis", {
      id: "ordered",
    });
  },
);
it("keeps failed approval consent reviewable and displays the actual error; viewers cannot approve", async () => {
  const h = harness();
  h.call.mockImplementation(async () => {
    throw Error("REAUTH_REQUIRED: sign in again");
  });
  h.choose(0, "owned-device");
  h.choose(1, "advertised-text");
  h.choose(2, "xhigh");
  h.consent();
  await elements(h.view())
    .find((node) => text(node) === "Analyze with my plan")!
    .props.onClick();
  await flush();
  expect(text(h.view())).toContain("REAUTH_REQUIRED");
  expect(
    elements(h.view()).find((node) => text(node) === "Analyze with my plan")!
      .props.disabled,
  ).toBe(false);
  h.props.readOnly = true;
  const tree = h.view();
  expect(
    elements(tree).find((node) => text(node) === "Analyze with my plan")!.props
      .disabled,
  ).toBe(true);
  const calls = h.call.mock.calls.length;
  await elements(tree)
    .find((node) => text(node) === "Analyze with my plan")!
    .props.onClick();
  expect(h.call).toHaveBeenCalledTimes(calls);
});
