import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effectIndex: 0,
  effects: [] as {
    deps: unknown[];
    run?: () => unknown;
    cleanup?: () => void;
  }[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [
      hooks.cells[index],
      (value: any) => {
        hooks.cells[index] =
          typeof value === "function" ? value(hooks.cells[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    return (hooks.cells[index] ??= { current: initial });
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = hooks.index++;
    const old = hooks.cells[index];
    if (!old || deps.some((value, i) => value !== old.deps[i]))
      hooks.cells[index] = { callback, deps };
    return hooks.cells[index].callback;
  },
  useEffect: (run: () => unknown, deps: unknown[]) => {
    const index = hooks.effectIndex++;
    const old = hooks.effects[index];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      old?.cleanup?.();
      hooks.effects[index] = { run, deps };
    }
  },
}));
import { AssistantConnections } from "./components/assistant-connections";

type Node = ReactElement<Record<string, any>>;
const cloudLabel = "Allow exact video analysis requests in my Work Cloud chat";
const localLabel = "Extract and organize automatically on my computer";
const approvalLabel = "I approve this library scope";
const scopes = ["links:save", "analysis:request", "analysis:execute"];
function setup(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    privateLibrary: true,
    workCloudMediaEnabled: true,
    clients: [{ id: "host", name: "Work Cloud", scopes }],
    grants: [] as any[],
    devices: [] as any[],
    context: null,
    repositoryNextCursor: null,
    repositories: [],
    ...overrides,
  };
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
function checkbox(tree: unknown, label: string) {
  const row = elements(tree).find(
    (node) => node.type === "label" && text(node).trim().startsWith(label),
  );
  expect(row, label).toBeDefined();
  return elements(row).find((node) => node.type === "input")!;
}
function button(tree: unknown, label: string) {
  const node = elements(tree).find(
    (node) => node.type === "button" && text(node) === label,
  );
  expect(node, label).toBeDefined();
  return node!;
}
function choice(tree: unknown, label: string, value: string) {
  const node = elements(tree).find(
    (node) => node.props["aria-label"] === label,
  );
  expect(node, label).toBeDefined();
  node!.props.onValueChange(value);
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function fixture(data = setup(), options = {}) {
  let current = data;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ result: current })),
  );
  const call = vi.fn(async (_operation: string, _args: unknown) => true);
  const props = {
    organizationId: "private",
    call,
    readOnly: false,
    demo: false,
    ...options,
  };
  const render = () => {
    hooks.index = 0;
    hooks.effectIndex = 0;
    const wrapper = AssistantConnections(props);
    const editor = wrapper.type as (props: any) => Node;
    const tree = editor(wrapper.props);
    for (const effect of hooks.effects)
      if (effect.run) {
        const cleanup = effect.run();
        effect.run = undefined;
        effect.cleanup =
          typeof cleanup === "function" ? (cleanup as () => void) : undefined;
      }
    return tree;
  };
  render();
  await flush();
  return {
    call,
    props,
    render,
    replace: (next: typeof data) => {
      current = next;
    },
    configure: () => {
      choice(render(), "Library access", "all");
      button(render(), "Select all actions").props.onClick();
    },
    acknowledge: () =>
      checkbox(render(), approvalLabel).props.onChange({
        target: { checked: true },
      }),
    save: async () => {
      button(render(), "Save reviewed access").props.onClick();
      await flush();
    },
  };
}
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.cells = [];
  hooks.effects = [];
  hooks.index = 0;
  hooks.effectIndex = 0;
  vi.unstubAllGlobals();
});

it("requires a separate Cloud choice and fresh acknowledgement, without a paired computer", async () => {
  const f = await fixture();
  f.configure();
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  f.acknowledge();
  expect(button(f.render(), "Save reviewed access").props.disabled).toBe(true);
  checkbox(f.render(), cloudLabel).props.onChange({
    target: { checked: true },
  });
  expect(checkbox(f.render(), approvalLabel).props.checked).toBe(false);
  expect(checkbox(f.render(), localLabel).props.checked).toBe(false);
  expect(checkbox(f.render(), localLabel).props.disabled).toBe(true);
  await f.save();
  expect(f.call).not.toHaveBeenCalled();
  f.acknowledge();
  expect(button(f.render(), "Save reviewed access").props.disabled).toBe(false);
  await f.save();
  expect(f.call).toHaveBeenCalledWith(
    "saveAssistantGrant",
    expect.objectContaining({
      cloudRequestPolicy: "explicit_per_source_v1",
      acknowledged: true,
      libraryScope: "all",
      expectedVersion: 0,
      scopes,
    }),
  );
  expect(f.call.mock.calls[0][1]).not.toHaveProperty("analysisDefaults");
  expect(text(f.render())).toContain("GitHub is not required");
  expect(text(f.render())).toContain("does not launch the Cloud task");
  expect(text(f.render())).toContain("Up to 6 new requests per hour");
});

it.each(["analysis:request", "analysis:execute"])(
  "does not grant Cloud permission without %s, even through an injected checkbox event",
  async (missing) => {
    const f = await fixture();
    f.configure();
    const label =
      missing === "analysis:request"
        ? "Use my saved local analysis preferences"
        : "Read separately approved text or public video links";
    checkbox(f.render(), label).props.onChange({ target: { checked: false } });
    const cloud = checkbox(f.render(), cloudLabel);
    expect(cloud.props.disabled).toBe(true);
    cloud.props.onChange({ target: { checked: true } });
    expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
    checkbox(f.render(), localLabel).props.onChange({
      target: { checked: false },
    });
    f.acknowledge();
    await f.save();
    expect(f.call.mock.calls[0][1]).not.toHaveProperty("cloudRequestPolicy");
  },
);

it.each([{ privateLibrary: false }, { workCloudMediaEnabled: false }])(
  "omits the Cloud control and policy when its private gate is unavailable: %j",
  async (gate) => {
    const f = await fixture(setup(gate));
    f.configure();
    expect(text(f.render())).not.toContain(cloudLabel);
    checkbox(f.render(), localLabel).props.onChange({
      target: { checked: false },
    });
    f.acknowledge();
    await f.save();
    expect(f.call.mock.calls[0][1]).not.toHaveProperty("cloudRequestPolicy");
  },
);

it("keeps legacy grants off and restores a saved Cloud choice only when editing it", async () => {
  const grant = {
    id: "grant",
    clientId: "host",
    scopes,
    sources: [],
    libraryScope: "all",
    version: 3,
    state: "active",
    expiresAt: null,
  };
  const f = await fixture(setup({ grants: [grant] }));
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  button(f.render(), "Edit preferences").props.onClick();
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  f.replace(
    setup({
      grants: [{ ...grant, cloudRequestPolicy: "explicit_per_source_v1" }],
    }),
  );
  button(f.render(), "Refresh access").props.onClick();
  await flush();
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  button(f.render(), "Edit preferences").props.onClick();
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(true);
  expect(checkbox(f.render(), approvalLabel).props.checked).toBe(false);
});

it("invalidates the reviewed binding after scope, grant version or availability changes", async () => {
  const f = await fixture();
  f.configure();
  checkbox(f.render(), cloudLabel).props.onChange({
    target: { checked: true },
  });
  f.acknowledge();
  choice(f.render(), "Library access", "personal");
  expect(checkbox(f.render(), approvalLabel).props.checked).toBe(false);
  await f.save();
  expect(f.call).not.toHaveBeenCalled();
  f.acknowledge();
  f.replace(setup({ workCloudMediaEnabled: false }));
  button(f.render(), "Refresh access").props.onClick();
  await flush();
  expect(text(f.render())).not.toContain(cloudLabel);
  expect(checkbox(f.render(), approvalLabel).props.checked).toBe(false);
  await f.save();
  expect(f.call).not.toHaveBeenCalled();
  f.replace(setup());
  button(f.render(), "Refresh access").props.onClick();
  await flush();
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
});

it("preserves local preferences until the user chooses Cloud and reviews the changed grant version", async () => {
  const local = {
    enabled: true,
    deviceId: "computer",
    profileBinding: "binding",
  };
  const grant = {
    id: "grant",
    clientId: "host",
    scopes,
    sources: [],
    libraryScope: "all",
    version: 3,
    state: "active",
    expiresAt: null,
    analysisDefaults: local,
  };
  const data = setup({
    grants: [grant],
    devices: [
      { id: "computer", name: "My computer", profileBinding: "binding" },
    ],
  });
  const f = await fixture(data);
  button(f.render(), "Edit preferences").props.onClick();
  expect(checkbox(f.render(), localLabel).props.checked).toBe(true);
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  expect(f.call).not.toHaveBeenCalled();
  checkbox(f.render(), cloudLabel).props.onChange({
    target: { checked: true },
  });
  f.acknowledge();
  f.replace({ ...data, grants: [{ ...grant, version: 4 }] });
  button(f.render(), "Refresh access").props.onClick();
  await flush();
  expect(checkbox(f.render(), approvalLabel).props.checked).toBe(false);
  await f.save();
  expect(f.call).not.toHaveBeenCalled();
  f.acknowledge();
  await f.save();
  expect(f.call).toHaveBeenCalledWith(
    "saveAssistantGrant",
    expect.objectContaining({
      expectedVersion: 4,
      cloudRequestPolicy: "explicit_per_source_v1",
      analysisDefaults: { ...local, enabled: false },
    }),
  );
  expect(grant.analysisDefaults).toEqual(local);
});

it("clears the Cloud choice when a required action is removed and does not restore it implicitly", async () => {
  const f = await fixture();
  f.configure();
  checkbox(f.render(), cloudLabel).props.onChange({
    target: { checked: true },
  });
  f.acknowledge();
  checkbox(
    f.render(),
    "Read separately approved text or public video links",
  ).props.onChange({
    target: { checked: false },
  });
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  expect(checkbox(f.render(), approvalLabel).props.checked).toBe(false);
  button(f.render(), "Select all actions").props.onClick();
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  f.acknowledge();
  await f.save();
  expect(f.call.mock.calls[0][1]).not.toHaveProperty("cloudRequestPolicy");
});

it("blocks Cloud selection and saving while read-only or saving", async () => {
  const f = await fixture();
  f.configure();
  f.props.readOnly = true;
  expect(checkbox(f.render(), cloudLabel).props.disabled).toBe(true);
  checkbox(f.render(), cloudLabel).props.onChange({
    target: { checked: true },
  });
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(false);
  f.acknowledge();
  await f.save();
  expect(f.call).not.toHaveBeenCalled();
  f.props.readOnly = false;
  checkbox(f.render(), cloudLabel).props.onChange({
    target: { checked: true },
  });
  f.acknowledge();
  let finish!: (value: boolean) => void;
  f.call.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  button(f.render(), "Save reviewed access").props.onClick();
  expect(checkbox(f.render(), cloudLabel).props.disabled).toBe(true);
  checkbox(f.render(), cloudLabel).props.onChange({
    target: { checked: false },
  });
  expect(checkbox(f.render(), cloudLabel).props.checked).toBe(true);
  finish(true);
  await flush();
  expect(f.call).toHaveBeenCalledTimes(1);
});
