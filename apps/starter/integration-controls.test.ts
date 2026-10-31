import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const hooks = vi.hoisted(() => ({
  cells: [] as unknown[],
  index: 0,
  effects: [] as (() => unknown)[],
  effectSlots: [] as unknown[][],
  effectIndex: 0,
}));
// Exercise actual JSX event handlers without installing a browser/DOM runtime.
// State is retained between explicit renders; effects run only when requested.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.cells))
      hooks.cells[index] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [
      hooks.cells[index],
      (value: unknown) => {
        hooks.cells[index] =
          typeof value === "function"
            ? (value as (old: unknown) => unknown)(hooks.cells[index])
            : value;
      },
    ];
  },
  useEffect: (effect: () => unknown, deps: unknown[]) => {
    const index = hooks.effectIndex++;
    if (JSON.stringify(hooks.effectSlots[index]) !== JSON.stringify(deps)) {
      hooks.effectSlots[index] = deps;
      hooks.effects.push(effect);
    }
  },
}));
import { PublicKnowledgePanel } from "./components/public-knowledge-panel";
import { PublicSaveContinuation } from "./components/public-save-continuation";
import { SetupJourney } from "./components/setup-journey";
import { TaskRuntimePicker } from "./components/task-runtime-picker";
type Node = ReactElement<Record<string, any>>;
function render<T>(component: (props: T) => unknown, props: T) {
  hooks.index = 0;
  hooks.effectIndex = 0;
  return component(props);
}
function elements(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement(tree)) return [];
  const node = tree as Node;
  return [node, ...elements(node.props.children)];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (isValidElement(tree)) return text((tree as Node).props.children);
  return typeof tree === "string" || typeof tree === "number"
    ? String(tree)
    : "";
}
function button(tree: unknown, name: string) {
  const node = elements(tree).find(
    (item) => item.type === "button" && text(item) === name,
  );
  expect(node, `Button ${name}`).toBeDefined();
  return node!;
}
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
afterEach(() => {
  hooks.cells = [];
  hooks.index = 0;
  hooks.effects = [];
  hooks.effectSlots = [];
  hooks.effectIndex = 0;
});
it("keeps authenticated withdrawal usable with a closed publication gate and disables new publication/region opt-in", async () => {
  const own = {
    enabled: false,
    editions: [
      {
        _id: "edition-one",
        state: "published",
        version: 2,
        slug: "permitted-edition",
        payload: { title: "Synthetic edition" },
      },
    ],
    collections: [
      {
        _id: "collection-one",
        state: "published",
        version: 3,
        slug: "permitted-collection",
        title: "Synthetic collection",
      },
    ],
    geography: [],
  };
  const call = vi.fn(async (operation: string) =>
    operation === "publicOwn" ? own : { withdrawn: true },
  );
  const props = {
    organizationId: "org-one",
    enabled: true,
    call,
    source: {
      _id: "source-one",
      generation: 1,
      updatedAt: 1,
      title: "Synthetic",
      state: "ready",
      analysis: { insights: [{ id: "idea", title: "Idea" }] },
    },
  };
  const view = () => {
    const outer = PublicKnowledgePanel(props) as Node;
    return render(outer.type as (props: any) => unknown, outer.props);
  };
  let tree = view();
  expect(call).not.toHaveBeenCalled();
  button(tree, "Load my editions and collections").props.onClick();
  await flush();
  tree = view();
  expect(
    elements(tree).some(
      (node) => text(node) === "Prepare exact public preview",
    ),
  ).toBe(false);
  expect(
    elements(tree).some((node) => text(node) === "Share selected region"),
  ).toBe(false);
  expect(button(tree, "Withdraw edition").props.disabled).toBe(false);
  await button(tree, "Withdraw edition").props.onClick();
  expect(call).toHaveBeenCalledWith("withdrawEdition", {
    id: "edition-one",
    version: 2,
  });
  tree = view();
  await button(tree, "Stop sharing my region").props.onClick();
  expect(call).toHaveBeenCalledWith("setGeography", {
    organizationId: "org-one",
    cell: null,
    explicitlyOptedIn: false,
  });
  expect(
    call.mock.calls.some(
      ([op]) => op === "prepareEdition" || op === "publishEdition",
    ),
  ).toBe(false);
});
it("public-version continuation does no work until explicit confirmation and preserves a changed-version refusal", async () => {
  const call = vi.fn(async () => {
    throw Error("This edition changed. Review it again.");
  });
  const props = {
    slug: "permitted-edition",
    version: 7,
    organizationId: "org-one",
    call,
    disabled: false,
  };
  let tree = render(PublicSaveContinuation, props);
  expect(call).not.toHaveBeenCalled();
  await button(tree, "Save reviewed edition to my Library").props.onClick();
  expect(call).toHaveBeenCalledWith("publicSaveEdition", {
    organizationId: "org-one",
    slug: "permitted-edition",
    expectedVersion: 7,
  });
  tree = render(PublicSaveContinuation, props);
  expect(text(tree)).toContain("This edition changed");
  expect(text(tree)).not.toContain("Saved to your Library");
});
it("optional setup acknowledgement persists only a review and local startup instructions grant no authority", async () => {
  let version = 4;
  const snapshot = {
    purposeSaved: true,
    sourceSaved: true,
    route: "local" as const,
    cloudAvailable: false,
    localEligible: true,
    prerequisitesChecked: false,
    paired: false,
    accountConnected: false,
    workerAvailable: false,
    sampleCited: false,
    assistantReviewed: false,
    projectConfirmed: false,
    importReviewed: false,
    preferencesReviewed: false,
    paused: false,
    startupEnabled: false,
  };
  const call = vi.fn(async (operation: string, _args: any) => {
    if (operation === "saveSetupJourney") {
      version++;
      return { version };
    }
    return { version, snapshot };
  });
  const props = {
    organizationId: "org-one",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  const view = () => render(SetupJourney, props);
  view();
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  let tree = view();
  const companion = elements(tree).find(
    (node) => node.props.snapshot === snapshot,
  )!;
  await companion.props.onAction("startup_enable");
  tree = view();
  expect(text(tree)).toContain("ABSOLUTE_CONFIG_PATH --start-at-sign-in");
  expect(call.mock.calls.every(([op]) => op === "setupJourney")).toBe(true);
  await companion.props.onAction("worker");
  tree = view();
  expect(text(tree)).toContain(
    "node scripts/companion.mjs run ABSOLUTE_CONFIG_PATH",
  );
  expect(text(tree)).not.toContain(
    "run ABSOLUTE_CONFIG_PATH --allow-approved-work",
  );
  await button(tree, "I reviewed my preferences").props.onClick();
  expect(call).toHaveBeenCalledWith("saveSetupJourney", {
    organizationId: "org-one",
    expectedVersion: 4,
    preferencesReviewed: true,
  });
  expect(
    call.mock.calls.every(([op]) =>
      ["setupJourney", "saveSetupJourney"].includes(op),
    ),
  ).toBe(true);
});
it("failed setup saves do not mark a review complete or suppress its error", async () => {
  const snapshot = {
    route: "save_only",
    sampleCited: false,
    preferencesReviewed: false,
  };
  const call = vi.fn(async (operation: string) =>
    operation === "setupJourney" ? { version: 1, snapshot } : null,
  );
  const props = {
    organizationId: "org-one",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  const view = () => render(SetupJourney, props);
  view();
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  let tree = view();
  await button(tree, "I reviewed my preferences").props.onClick();
  tree = view();
  expect(text(tree)).toContain("not confirmed");
  expect(button(tree, "I reviewed my preferences").props.disabled).toBe(false);
});
it("local prerequisite reports require explicit bounded JSON submission and preserve backend authority", async () => {
  const snapshot = { route: "local", sampleCited: false };
  const call = vi.fn(async (operation: string) =>
    operation === "setupJourney" ? { version: 3, snapshot } : { version: 4 },
  );
  const props = {
    organizationId: "org-one",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  const view = () => render(SetupJourney, props);
  view();
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  let tree = view();
  const report = { schemaVersion: 1, checks: { node: "pass" } };
  elements(tree)
    .find((node) => node.type === "textarea")!
    .props.onChange({ target: { value: JSON.stringify(report) } });
  tree = view();
  expect(call.mock.calls.every(([op]) => op === "setupJourney")).toBe(true);
  await elements(tree)
    .find((node) => node.type === "form")!
    .props.onSubmit({ preventDefault() {} });
  expect(call).toHaveBeenCalledWith("saveSetupJourney", {
    organizationId: "org-one",
    expectedVersion: 3,
    preflightReport: report,
  });
  tree = view();
  expect(text(tree)).toContain("not independent installation verification");
  expect(
    elements(tree).find((node) => node.type === "textarea")!.props.value,
  ).toBe("");
  elements(tree)
    .find((node) => node.type === "textarea")!
    .props.onChange({ target: { value: " ".repeat(16385) } });
  tree = view();
  const before = call.mock.calls.length;
  await elements(tree)
    .find((node) => node.type === "form")!
    .props.onSubmit({ preventDefault() {} });
  expect(call.mock.calls.length).toBe(before);
  expect(text(view())).toContain("local report is invalid");
});

it.each([undefined, "unavailable", "available_unverified"] as const)(
  "renders the same execution picker for text state %s without another request or a saved route change",
  async (state) => {
    const snapshot = {
      route: "cloud",
      cloudAvailable: false,
      localEligible: false,
      sampleCited: false,
      paired: false,
      accountConnected: false,
      workerAvailable: false,
      workCloudTextState: state,
    };
    const call = vi.fn(async (_operation: string, _args: any) => ({
      version: 1,
      snapshot,
    }));
    const props = {
      organizationId: "distinct-route-owner",
      call,
      onNavigate: vi.fn(),
      onSave: vi.fn(),
    };
    render(SetupJourney, props);
    for (const effect of hooks.effects.splice(0)) effect();
    await flush();
    const tree = render(SetupJourney, props);
    const copy = text(tree);
    expect(copy).toContain("Saved route:");
    expect(copy).toContain("VibeScroll's servers");
    const picker = elements(tree).find(
      (node) => node.type === TaskRuntimePicker,
    )!;
    expect(picker.props.value).toBe("cloud");
    expect(picker.props.serverAvailable).toBe(false);
    expect(picker.props.localAvailable).toBe(false);
    expect(call).toHaveBeenCalledExactlyOnceWith("setupJourney", {
      organizationId: "distinct-route-owner",
    });
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  },
);
