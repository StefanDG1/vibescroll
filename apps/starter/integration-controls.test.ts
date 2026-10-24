import { afterEach, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import { ProjectBuilderGuide } from "./components/project-builder-guide";
import { advanceJourney } from "../../packages/onboarding/project-builder-journey";
type Node = ReactElement<Record<string, any>>;
it("uses confirmed journey metadata without broad setup queries or readiness changes", async () => {
  const journey = advanceJourney(undefined, { type: "start" }, 100);
  const updated = advanceJourney(journey, { type: "next" }, 200);
  const snapshot = {
    purposeSaved: true,
    route: "save_only",
    sampleCited: false,
    accountConnected: false,
  };
  const call = vi.fn(async (operation: string) =>
    operation === "setupJourney"
      ? { version: 7, snapshot, journey }
      : { version: 8, journey: updated },
  );
  const props = {
    organizationId: "confirmed-chapter-workspace",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  const initial = elements(render(SetupJourney, props)).find(
    (item) => item.props.journey === journey,
  )!;
  await initial.props.onJourneyAction({ type: "next" });
  const confirmed = elements(render(SetupJourney, props)).find(
    (item) => item.props.journey?.substep === 1,
  )!;
  expect(confirmed.props.snapshot).toEqual(snapshot);
  expect(confirmed.props.journey).toEqual(updated);
  expect(
    call.mock.calls.filter(([operation]) => operation === "setupJourney"),
  ).toHaveLength(1);
  expect(
    call.mock.calls.filter(([operation]) => operation === "saveSetupJourney"),
  ).toHaveLength(1);
});
it("ignores a delayed old-workspace confirmed journey reply after the current workspace loads", async () => {
  const old = advanceJourney(undefined, { type: "start" }, 100);
  const current = advanceJourney(
    advanceJourney(undefined, { type: "start" }, 300),
    { type: "next" },
    400,
  );
  let resolveMutation!: (value: unknown) => void;
  const waiting = new Promise((resolve) => {
    resolveMutation = resolve;
  });
  const call = vi.fn(async (operation: string, args: any) =>
    operation === "saveSetupJourney"
      ? waiting
      : args.organizationId === "old-save-workspace"
        ? { version: 7, snapshot: { purposeSaved: true }, journey: old }
        : { version: 20, snapshot: { purposeSaved: true }, journey: current },
  );
  const props = {
    organizationId: "old-save-workspace",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  const oldComponent = elements(render(SetupJourney, props)).find(
    (item) => item.props.journey === old,
  )!;
  const pendingSave = oldComponent.props.onJourneyAction({ type: "next" });
  props.organizationId = "current-save-workspace";
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  resolveMutation({
    version: 8,
    journey: advanceJourney(old, { type: "next" }, 200),
  });
  await pendingSave;
  const latest = elements(render(SetupJourney, props)).find(
    (item) => item.props.journey,
  )!;
  expect(latest.props.journey).toEqual(current);
  expect(
    call.mock.calls.filter(([operation]) => operation === "setupJourney"),
  ).toHaveLength(2);
});
it("keeps failed journey mutations unadvanced and reconciles current progress once without retrying", async () => {
  const journey = advanceJourney(undefined, { type: "start" }, 100);
  const call = vi.fn(async (operation: string) => {
    if (operation === "saveSetupJourney")
      throw Error("APPROVAL_STALE: Reload current setup.");
    return { version: 7, snapshot: { purposeSaved: true }, journey };
  });
  const props = {
    organizationId: "failed-chapter-workspace",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  const companion = elements(render(SetupJourney, props)).find(
    (item) => item.props.journey === journey,
  )!;
  await expect(
    companion.props.onJourneyAction({ type: "next" }),
  ).rejects.toThrow("Journey save not confirmed");
  expect(
    elements(render(SetupJourney, props)).find((item) => item.props.journey)!
      .props.journey,
  ).toEqual(journey);
  expect(text(render(SetupJourney, props))).toContain("Reload current setup");
  expect(
    call.mock.calls.filter(([operation]) => operation === "saveSetupJourney"),
  ).toHaveLength(1);
  expect(
    call.mock.calls.filter(([operation]) => operation === "setupJourney"),
  ).toHaveLength(2);
});
it("saves exact chapter actions through the existing versioned setup call and reloads persisted progress", async () => {
  const snapshot = {
    purposeSaved: true,
    route: "save_only",
    sampleCited: false,
  };
  let saved = {
    version: 7,
    snapshot,
    journey: advanceJourney(undefined, { type: "start" }, 100),
  };
  const call = vi.fn(async (operation: string, args: any) => {
    if (operation === "setupJourney") return structuredClone(saved);
    expect(operation).toBe("saveSetupJourney");
    expect(args.organizationId).toBe("chapter-workspace");
    expect(args.expectedVersion).toBe(saved.version);
    saved = {
      ...saved,
      version: saved.version + 1,
      journey: advanceJourney(saved.journey, args.journeyAction, 200),
    };
    return { version: saved.version };
  });
  const props = {
    organizationId: "chapter-workspace",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  let node = elements(render(SetupJourney, props)).find(
    (item) => item.props.journey?.version === "project-builder-v1",
  )!;
  expect(node.props.journey.substep).toBe(0);
  await node.props.onJourneyAction({ type: "next" });
  expect(call).toHaveBeenCalledWith("saveSetupJourney", {
    organizationId: "chapter-workspace",
    expectedVersion: 7,
    journeyAction: { type: "next" },
  });
  expect(saved.journey.substep).toBe(1);
  hooks.cells = [];
  hooks.index = 0;
  hooks.effects = [];
  hooks.effectSlots = [];
  hooks.effectIndex = 0;
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  node = elements(render(SetupJourney, props)).find(
    (item) => item.props.journey?.version === "project-builder-v1",
  )!;
  expect(node.props.journey.substep).toBe(1);
  expect(node.props.snapshot).toEqual(snapshot);
  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onNavigate).not.toHaveBeenCalled();
});
it("does not expose prior workspace chapter progress while the new workspace reply is delayed", async () => {
  const journey = advanceJourney(undefined, { type: "start" }, 100);
  let resolveNext!: (value: unknown) => void;
  const waiting = new Promise((resolve) => {
    resolveNext = resolve;
  });
  const call = vi.fn(async (_operation: string, args: any) =>
    args.organizationId === "old-chapter-workspace"
      ? { version: 1, snapshot: { purposeSaved: true }, journey }
      : waiting,
  );
  const props = {
    organizationId: "old-chapter-workspace",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  expect(
    elements(render(SetupJourney, props)).some(
      (item) => item.props.journey === journey,
    ),
  ).toBe(true);
  props.organizationId = "new-chapter-workspace";
  expect(
    elements(render(SetupJourney, props)).some((item) => item.props.journey),
  ).toBe(false);
  for (const effect of hooks.effects.splice(0)) effect();
  resolveNext({ version: 2, snapshot: { purposeSaved: true }, journey: null });
  await flush();
  expect(
    elements(render(SetupJourney, props)).some((item) => item.props.journey),
  ).toBe(false);
  expect(text(render(SetupJourney, props))).toContain(
    "Start project-builder guide",
  );
});
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
  vi.unstubAllGlobals();
  hooks.cells = [];
  hooks.index = 0;
  hooks.effects = [];
  hooks.effectSlots = [];
  hooks.effectIndex = 0;
});
it.each([true, false])(
  "offers and submits a reviewed supplied reference only for supplied text: %s",
  async (supplied) => {
    const call = vi.fn(async (operation: string) =>
      operation === "publicOwn"
        ? { enabled: true, editions: [], collections: [], geography: [] }
        : { id: "draft", version: 1, hash: "fixture-hash", payload: {} },
    );
    const props = {
      organizationId: "reference-org",
      enabled: true,
      call,
      source: {
        _id: "reference-source",
        kind: supplied ? "text" : "url",
        sourceRevision: supplied
          ? undefined
          : { sourceType: "github_repository" },
        generation: 2,
        updatedAt: 3,
        title: "Reviewed text",
        state: "ready",
        analysis: { insights: [{ id: "idea", title: "Review evidence" }] },
      },
    };
    const view = () => {
      const outer = PublicKnowledgePanel(props) as Node;
      return render(outer.type as (props: any) => unknown, outer.props);
    };
    let tree = view();
    await button(tree, "Load my editions and collections").props.onClick();
    await flush();
    tree = view();
    expect(
      elements(tree).some(
        (n) => n.type === "input" && n.props.name === "suppliedReference",
      ),
    ).toBe(supplied);
    if (!supplied) return;
    elements(tree)
      .find(
        (n) =>
          n.type === "input" &&
          n.props.type === "checkbox" &&
          !n.props.name &&
          typeof n.props.onChange === "function",
      )!
      .props.onChange({ target: { checked: true } });
    tree = view();
    const url = `https://github.com/example/project/blob/${"a".repeat(40)}/README.md`;
    const fields: Record<string, string> = {
      slug: "reviewed-supplied",
      publisher: "Fixture publisher",
      rightsBasis: "licensed",
      permissionReference: "MIT permission",
      expires: "2026-11-23",
      reuse: "on",
      suppliedReference: url,
      referenceReviewed: "on",
    };
    vi.stubGlobal(
      "FormData",
      class {
        get(key: string) {
          return fields[key] ?? null;
        }
      },
    );
    await elements(tree)
      .find((n) => n.type === "form")!
      .props.onSubmit({ preventDefault() {}, currentTarget: {} });
    expect(call).toHaveBeenCalledWith(
      "prepareEdition",
      expect.objectContaining({
        sourceId: "reference-source",
        generation: 2,
        revision: 3,
        insightIds: ["idea"],
        suppliedReference: { url, explicitlyReviewed: true },
      }),
    );
  },
);
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
  expect(button(tree, "Share selected region").props.disabled).toBe(true);
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
  expect(text(tree)).toContain('"ABSOLUTE_CONFIG_PATH" --start-at-sign-in');
  expect(call.mock.calls.every(([op]) => op === "setupJourney")).toBe(true);
  await companion.props.onAction("worker");
  tree = view();
  expect(text(tree)).toContain(
    'node scripts/companion.mjs run "ABSOLUTE_CONFIG_PATH"',
  );
  expect(text(tree)).not.toContain(
    'run "ABSOLUTE_CONFIG_PATH" --allow-approved-work',
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
it("withholds another workspace's configuration while current setup is loading", async () => {
  const snapshot = { route: "local", sampleCited: false };
  let resolveCurrent!: (value: any) => void;
  const pending = new Promise((resolve) => {
    resolveCurrent = resolve;
  });
  const configuration = (workspaceId: string) => ({
    server: "https://fixture.convex.site/",
    workspaceId,
    protocolVersion: "1.0.0",
    credentialVaultAdapter: "windows-credential-manager",
    deviceName: "Fixture computer",
  });
  const call = vi.fn(async (_operation: string, args: any) =>
    args.organizationId === "first-workspace"
      ? {
          version: 1,
          snapshot,
          pairingConfiguration: configuration("first-workspace"),
        }
      : pending,
  );
  const props = {
    organizationId: "first-workspace",
    call,
    onNavigate: vi.fn(),
    onSave: vi.fn(),
  };
  render(SetupJourney, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  expect(
    button(render(SetupJourney, props), "Download new computer configuration")
      .props.disabled,
  ).toBe(false);
  props.organizationId = "current-workspace";
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(text(render(SetupJourney, props))).not.toContain(
      "Download new computer configuration",
    );
    for (const effect of hooks.effects.splice(0)) effect();
    await flush();
  }
  resolveCurrent({
    version: 7,
    snapshot,
    pairingConfiguration: configuration("current-workspace"),
  });
  await flush();
  expect(
    button(render(SetupJourney, props), "Download new computer configuration")
      .props.disabled,
  ).toBe(false);
  expect(call).toHaveBeenCalledTimes(2);
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
  "discloses experimental text state %s without another request or a saved route change",
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
    expect(copy).toContain("Managed cloud");
    expect(copy).toContain("Managed processing:");
    expect(copy).toContain("unavailable");
    expect(copy).toContain(
      state === "available_unverified"
        ? "Available for text review; processing connection unverified."
        : state === "unavailable"
          ? "Not available for this account."
          : "Text-review availability unverified.",
    );
    expect(copy).toContain("without GitHub or a paired computer");
    expect(copy).toContain(
      "Successful host execution and video processing remain unverified",
    );
    expect(
      elements(tree).some(
        (node) =>
          node.props.href === "/help/work-cloud-text-review" &&
          node.props.prefetch === false,
      ),
    ).toBe(true);
    expect(call).toHaveBeenCalledExactlyOnceWith("setupJourney", {
      organizationId: "distinct-route-owner",
    });
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  },
);
it("keeps the processing chapter's experimental text guidance distinct without advancing or connecting anything", () => {
  const started = advanceJourney(undefined, { type: "start" }, 100);
  const journey = advanceJourney(started, { type: "next" }, 200);
  const onAction = vi.fn(async () => {});
  for (const state of [
    undefined,
    "unavailable",
    "available_unverified",
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ProjectBuilderGuide, {
        journey,
        onAction,
        onNavigate: vi.fn(),
        onSave: vi.fn(),
        snapshot: {
          purposeSaved: true,
          sourceSaved: false,
          route: "save_only",
          cloudAvailable: false,
          workCloudTextState: state,
          localEligible: false,
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
        },
      }),
    );
    expect(html).toContain("Connect processing");
    expect(html).toContain("Managed cloud uses its existing credits");
    expect(html).toContain(
      state === "available_unverified"
        ? "Available for text review; processing connection unverified."
        : state === "unavailable"
          ? "Not available for this account."
          : "Text-review availability unverified.",
    );
    expect(html).toContain("without GitHub or a paired computer");
    expect(html).toContain(
      "Successful host execution and video processing remain unverified",
    );
    expect(html).toContain('href="/help/work-cloud-text-review"');
    expect(journey).toEqual(advanceJourney(started, { type: "next" }, 200));
    expect(onAction).not.toHaveBeenCalled();
  }
});
