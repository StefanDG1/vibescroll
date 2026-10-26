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
import { PersonalSourceAnalysis, CaptureForm } from "./components/console";
import { TaskRuntimePicker } from "./components/task-runtime-picker";
type Node = ReactElement<Record<string, any>>;
afterEach(() => {
  hooks.values = [];
  hooks.index = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["save_only", "cloud"])(
  "preserves the saved %s route without falling back to local processing",
  async (preferredRoute) => {
    const call = vi.fn(async (_operation: string) => "saved-source");
    hooks.index = 0;
    const tree = CaptureForm({
      organizationId: "workspace",
      preferredRoute,
      personalEnabled: true,
      cloudEnabled: false,
      linkAnalysisEnabled: true,
      call,
      onDone: vi.fn(),
    });
    const picker = elements(tree).find(
      (node) => node.type === TaskRuntimePicker,
    )!;
    expect(picker.props.value).toBe(
      preferredRoute === "cloud" ? "cloud" : undefined,
    );
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-save" });
    vi.stubGlobal(
      "FormData",
      class {
        get(name: string) {
          return (
            {
              url: "https://www.instagram.com/reel/Example/",
              rights: "on",
            } as Record<string, string>
          )[name];
        }
      },
    );
    await tree.props.onSubmit({
      preventDefault() {},
      currentTarget: { reset() {} },
    });
    expect(call.mock.calls.map(([operation]) => operation)).toEqual([
      "capture",
    ]);
  },
);
it("uses actual selected effort for automatic URL capture and rejects missing choices before saving", async () => {
  const h = harness();
  h.device.subscriptionCapabilities.value.models[1].reasoningEfforts = ["high"];
  const call = vi.fn(async (operation) =>
    operation === "checkPersonalSession"
      ? true
      : operation === "capture"
        ? "captured-source"
        : { started: true },
  );
  const props = {
    organizationId: "workspace",
    devices: [h.device],
    personalEnabled: true,
    linkAnalysisEnabled: true,
    call,
    onDone: vi.fn(),
  };
  const view = () => {
    hooks.index = 0;
    return CaptureForm(props);
  };
  vi.stubGlobal(
    "FormData",
    class {
      get(name: string) {
        return (
          {
            url: "https://www.instagram.com/p/Example/",
            title: "Synthetic source",
            ownPlan: "on",
            rights: "on",
          } as Record<string, string>
        )[name];
      }
    },
  );
  await view().props.onSubmit({ preventDefault() {}, currentTarget: {} });
  expect(call).not.toHaveBeenCalled();
  const choose = (value: string) =>
    elements(view())
      .find(
        (node) =>
          typeof node.props.onValueChange === "function" &&
          elements(node.props.children).some(
            (option) =>
              option.type === "option" && option.props.value === value,
          ),
      )!
      .props.onValueChange(value);
  expect(text(view())).not.toContain("Actual text model");
  expect(text(view())).not.toContain("Legacy echo");
  choose("advertised-image");
  choose("high");
  await view().props.onSubmit({ preventDefault() {}, currentTarget: {} });
  expect(call).toHaveBeenCalledWith("approvePersonalBatch", {
    deviceId: "owned-device",
    model: "advertised-image",
    effort: "high",
    useOwnPlan: true,
    maxComputeCredits: 10,
    sources: [{ id: "captured-source", generation: 0 }],
  });
});
it.each([true, false])(
  "uses the saved Cloud handoff only when ready=%s and never falls back",
  async (available) => {
    const call = vi.fn(async () => ({
      sourceId: "saved-source",
      status: "waiting_for_cloud_setup",
    }));
    const done = vi.fn();
    const props = {
      organizationId: "workspace",
      preferredRoute: "work_cloud",
      workCloud: {
        available,
        configured: true,
        grantId: "grant",
        grantVersion: 3,
      },
      personalEnabled: true,
      cloudEnabled: true,
      linkAnalysisEnabled: true,
      call,
      onDone: done,
    };
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-save" });
    vi.stubGlobal(
      "FormData",
      class {
        get(name: string) {
          return (
            {
              url: "https://www.instagram.com/reel/Example/",
              rights: "on",
            } as Record<string, string>
          )[name];
        }
      },
    );
    hooks.index = 0;
    const tree = CaptureForm(props);
    expect(
      elements(tree).find((n) => n.type === TaskRuntimePicker)!.props.value,
    ).toBe("work_cloud");
    await tree.props.onSubmit({ preventDefault() {}, currentTarget: {} });
    if (available) {
      expect(call).toHaveBeenCalledExactlyOnceWith(
        "captureWorkCloud",
        expect.objectContaining({
          grantId: "grant",
          grantVersion: 3,
          title: "Imported video link",
          rightsAttested: true,
        }),
      );
      expect(done).toHaveBeenCalledExactlyOnceWith("saved-source", true);
    } else {
      expect(call).not.toHaveBeenCalled();
      expect(done).not.toHaveBeenCalled();
    }
  },
);
it("blocks expired automatic capture choices before a new source or upload grant", async () => {
  const h = harness();
  const call = vi.fn();
  const props = {
    organizationId: "workspace",
    devices: [h.device],
    personalEnabled: true,
    linkAnalysisEnabled: true,
    call,
    onDone: vi.fn(),
  };
  const view = () => {
    hooks.index = 0;
    return CaptureForm(props);
  };
  const choose = (value: string) =>
    elements(view())
      .find(
        (node) =>
          typeof node.props.onValueChange === "function" &&
          elements(node.props.children).some(
            (option) =>
              option.type === "option" && option.props.value === value,
          ),
      )!
      .props.onValueChange(value);
  choose("advertised-image");
  choose("medium");
  const form = view();
  vi.stubGlobal(
    "FormData",
    class {
      get() {
        return "on";
      }
    },
  );
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600001);
  await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  expect(call).not.toHaveBeenCalled();
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
    orderedPersonalEnabled: true,
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
it("offers ordered private analysis only to a current protocol runner and image-capable advertised model", async () => {
  const h = harness({
    source: {
      _id: "ordered-upload",
      kind: "upload",
      generation: 2,
      state: "saved",
      personalOrderedInput: { schemaVersion: "ordered-personal-input-v1" },
    },
  });
  expect(text(h.view())).toContain("Start your paired companion");
  expect(text(h.view())).not.toContain("Check account and analyze files");
  (h.device as any).personalInputProtocols = ["ordered-personal-v1"];
  h.choose(0, "owned-device");
  expect(text(h.view())).not.toContain("Actual text model");
  expect(text(h.view())).toContain("Actual image model");
  h.choose(1, "advertised-image");
  h.choose(2, "medium");
  h.consent();
  const action = elements(h.view()).find(
    (node) => text(node) === "Check account and analyze files",
  )!;
  expect(action.props.disabled).toBe(false);
  await action.props.onClick();
  await flush();
  expect(h.call).toHaveBeenCalledWith("approvePersonalAnalysis", {
    id: "ordered-upload",
    generation: 2,
    deviceId: "owned-device",
    model: "advertised-image",
    effort: "medium",
    useOwnPlan: true,
    maxComputeCredits: 10,
  });
  h.props.source.personalAnalysis = {
    state: "queued",
    ordered: { phase: "preflight" },
  };
  expect(text(h.view())).toContain("Media preparation has not started");
  expect(text(h.view())).toContain("Cancel personal analysis");
});
it("shows the closed ordered-processing gate without offering an approval", () => {
  const h = harness({
    orderedPersonalEnabled: false,
    source: {
      _id: "ordered-upload",
      kind: "upload",
      generation: 2,
      state: "saved",
      personalOrderedInput: { schemaVersion: "ordered-personal-input-v1" },
    },
  });
  (h.device as any).personalInputProtocols = ["ordered-personal-v1"];
  expect(text(h.view())).toContain(
    "Ordered-media analysis is awaiting its supported route",
  );
  expect(text(h.view())).not.toContain("Check account and analyze files");
});
it("refuses an ordered approval if its selected runner loses protocol support after render", async () => {
  const h = harness({
    source: {
      _id: "ordered-upload",
      kind: "upload",
      generation: 2,
      state: "saved",
      personalOrderedInput: { schemaVersion: "ordered-personal-input-v1" },
    },
  });
  (h.device as any).personalInputProtocols = ["ordered-personal-v1"];
  h.choose(0, "owned-device");
  h.choose(1, "advertised-image");
  h.choose(2, "medium");
  h.consent();
  const action = elements(h.view()).find(
    (node) => text(node) === "Check account and analyze files",
  )!;
  (h.device as any).personalInputProtocols = [];
  await action.props.onClick();
  await flush();
  expect(h.call).not.toHaveBeenCalled();
});
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
