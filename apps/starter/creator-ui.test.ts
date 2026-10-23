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
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.cells)) hooks.cells[index] = { current: initial };
    return hooks.cells[index];
  },
  useEffect: (effect: () => unknown, deps: unknown[]) => {
    const index = hooks.effectIndex++;
    if (JSON.stringify(hooks.effectSlots[index]) !== JSON.stringify(deps)) {
      hooks.effectSlots[index] = deps;
      hooks.effects.push(effect);
    }
  },
}));
import {
  CreatorFollowingPanel as CreatorFollowing,
  creatorLink,
} from "./components/creator-following";
import { CreatorDigestPanel as CreatorDigest } from "./components/creator-digest";
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
  vi.unstubAllGlobals();
  hooks.cells = [];
  hooks.index = 0;
  hooks.effects = [];
  hooks.effectSlots = [];
  hooks.effectIndex = 0;
});
const follow = {
  _id: "follow-one",
  version: 4,
  canonical: "https://www.instagram.com/example/",
  platform: "instagram",
  state: "pending",
  operational: false,
  cutoff: 100,
  mode: "latest10",
  maxAssets: 30,
  maxVideoMs: 600000,
  route: "own_subscription",
  timezone: "UTC",
  digestHour: 9,
  discovery: null,
};
const following = {
  items: [follow],
  next: null,
  providerAvailable: false,
  explanation: "Provider rights are pending.",
};
const delivery = {
  id: "post-one",
  state: "pending",
  sourceId: null,
  canonical: "https://www.instagram.com/p/example/",
  caption: "A real supplied caption <script>",
  publishedAt: null,
  observedAt: 100,
  mediaKinds: ["image"],
  assetCount: null,
  revisionKey: "revision",
  timezone: "UTC",
  day: "2026-10-23",
  incomplete: true,
  reason: "pending",
};
async function mount<T>(component: (props: T) => unknown, props: T) {
  render(component, props);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  return render(component, props);
}
it("keeps pending follow preferences honest and sends version-bound changes with narrow reload only", async () => {
  const call = vi.fn(
    async (_operation: string, _args: Record<string, unknown>) => following,
  );
  const props = { organizationId: "workspace", call };
  const tree = await mount(CreatorFollowing, props);
  expect(text(tree)).toContain("Pending provider access");
  expect(text(tree)).toContain("Pending; discovery is not active");
  expect(text(tree)).toContain("Last discovery check: Not recorded");
  await button(tree, "Pause").props.onClick();
  await flush();
  expect(call).toHaveBeenCalledWith("creatorFollowChange", {
    id: follow._id,
    expectedVersion: 4,
    action: "pause",
  });
  expect(call.mock.calls.map((row) => row[0])).toEqual([
    "creatorFollowing",
    "creatorFollowChange",
    "creatorFollowing",
  ]);
});
it("requires the exact quote and explicit incomplete acceptance before approving past metadata", async () => {
  const quote = {
    hash: "exact-quote",
    posts: [
      {
        postId: "past",
        canonical: delivery.canonical,
        publishedAt: null,
        assetCount: 1,
      },
    ],
    assets: 1,
    videoMs: 0,
    needsReview: 0,
    overLimit: 0,
    incomplete: true,
    processingStarted: false,
  };
  const call = vi.fn(async (operation: string) =>
    operation === "creatorPreviewBackfill" ? quote : following,
  );
  const props = { organizationId: "workspace", call };
  let tree = await mount(CreatorFollowing, props);
  await button(tree, "Review observed latest-ten posts").props.onClick();
  tree = render(CreatorFollowing, props);
  expect(button(tree, "Approve these metadata additions").props.disabled).toBe(
    true,
  );
  expect(text(tree)).toContain("Processing has not started");
  elements(tree)
    .find((node) => node.type === "input" && node.props.checked === false)!
    .props.onChange({ target: { checked: true } });
  tree = render(CreatorFollowing, props);
  expect(button(tree, "Approve these metadata additions").props.disabled).toBe(
    false,
  );
  await button(tree, "Approve these metadata additions").props.onClick();
  await flush();
  expect(call).toHaveBeenCalledWith("creatorApproveBackfill", {
    id: follow._id,
    expectedVersion: 4,
    quoteHash: "exact-quote",
    acceptIncomplete: true,
  });
});
it("hides old-workspace follow rows and quotes immediately and ignores their delayed response", async () => {
  let resolve!: (value: unknown) => void;
  const delayed = new Promise((done) => {
    resolve = done;
  });
  const call = vi.fn(
    async (operation: string, args: Record<string, unknown>) =>
      operation === "creatorPreviewBackfill"
        ? delayed
        : args.organizationId === "old"
          ? following
          : { ...following, items: [] },
  );
  const old = { organizationId: "old", call },
    current = { organizationId: "new", call };
  let tree = await mount(CreatorFollowing, old);
  const request = button(
    tree,
    "Review observed latest-ten posts",
  ).props.onClick();
  // Simulate the production wrapper key changing: old effect cleanup, fresh hook cells.
  (hooks.cells[0] as { current: boolean }).current = false;
  hooks.cells = [];
  hooks.effectSlots = [];
  tree = render(CreatorFollowing, current);
  expect(text(tree)).not.toContain(follow.canonical);
  for (const effect of hooks.effects.splice(0)) effect();
  await flush();
  resolve({
    hash: "old",
    posts: [],
    assets: 0,
    videoMs: 0,
    incomplete: false,
    overLimit: 0,
  });
  await request;
  expect(text(render(CreatorFollowing, current))).not.toContain(
    "Review observed past posts",
  );
});
it("keeps unconfirmed saves visible for retry and never claims processing", async () => {
  const call = vi.fn(async (operation: string) => {
    if (operation === "creatorSavePost")
      throw Error("APPROVAL_STALE: metadata changed");
    return { items: [delivery], next: null };
  });
  const props = { organizationId: "workspace", call, onOpenSource: vi.fn() };
  const tree = await mount(CreatorDigest, props);
  expect(text(tree)).toContain("Published: Not recorded");
  expect(text(tree)).toContain("Assets: Unknown");
  expect(text(tree)).toContain("Incomplete coverage");
  await button(tree, "Save post metadata").props.onClick();
  await flush();
  const failed = render(CreatorDigest, props);
  expect(text(failed)).toContain("metadata changed");
  expect(text(failed)).not.toContain("metadata saved");
  expect(button(failed, "Save post metadata").props.disabled).toBe(false);
  expect(call).toHaveBeenCalledTimes(2);
});
it("saves metadata explicitly without opening or processing it, then opens only a confirmed source", async () => {
  let saved = false;
  const call = vi.fn(async (operation: string) => {
    if (operation === "creatorSavePost") {
      saved = true;
      return { sourceId: "source-confirmed", processingStarted: false };
    }
    return {
      items: [{ ...delivery, sourceId: saved ? "source-confirmed" : null }],
      next: null,
    };
  });
  const onOpenSource = vi.fn(),
    props = { organizationId: "workspace", call, onOpenSource };
  let tree = await mount(CreatorDigest, props);
  await button(tree, "Save post metadata").props.onClick();
  await flush();
  tree = render(CreatorDigest, props);
  expect(text(tree)).toContain("Analysis has not started");
  expect(onOpenSource).not.toHaveBeenCalled();
  button(tree, "Open saved source").props.onClick();
  expect(onOpenSource).toHaveBeenCalledWith("source-confirmed");
});
it("paginates only on request, deduplicates deliveries and sends private suppression explicitly", async () => {
  const call = vi.fn(async (_op: string, args: Record<string, unknown>) => ({
    items: [delivery],
    next: args.cursor ? null : "next-page",
  }));
  const props = { organizationId: "workspace", call, onOpenSource: vi.fn() };
  let tree = await mount(CreatorDigest, props);
  expect(call).toHaveBeenCalledTimes(1);
  await button(tree, "Load more digest posts").props.onClick();
  await flush();
  tree = render(CreatorDigest, props);
  expect(elements(tree).filter((node) => node.type === "article")).toHaveLength(
    1,
  );
  expect(call).toHaveBeenCalledWith("creatorDigest", {
    organizationId: "workspace",
    cursor: "next-page",
  });
  await button(tree, "Don’t add this post again").props.onClick();
  await flush();
  expect(call).toHaveBeenCalledWith("creatorSuppress", { id: delivery.id });
});
it("refuses foreign, credential-bearing and script links while preserving approved platform links", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://attacker.example/",
    "https://user:secret@instagram.com/example/",
    "https://instagram.com.attacker.example/",
  ])
    expect(creatorLink(value)).toBeUndefined();
  expect(creatorLink(delivery.canonical)).toBe(delivery.canonical);
});
it("submits an attested bounded future/save-only preference without granting processing", async () => {
  let rights = false;
  vi.stubGlobal(
    "FormData",
    class {
      get(key: string) {
        return (
          {
            profileUrl: follow.canonical,
            rights: rights ? "on" : null,
            maxAssets: "30",
            videoMinutes: "10",
            timezone: "UTC",
            digestHour: "9",
          } as Record<string, unknown>
        )[key];
      }
    },
  );
  const call = vi.fn(
    async (_operation: string, _args: Record<string, unknown>) => following,
  );
  const props = { organizationId: "workspace", call };
  let tree = await mount(CreatorFollowing, props);
  elements(tree)
    .find((node) => node.type === "form")!
    .props.onSubmit({ preventDefault() {}, currentTarget: {} });
  expect(call).toHaveBeenCalledTimes(1);
  expect(text(render(CreatorFollowing, props))).toContain(
    "Confirm your permission",
  );
  rights = true;
  tree = render(CreatorFollowing, props);
  elements(tree)
    .find((node) => node.type === "form")!
    .props.onSubmit({ preventDefault() {}, currentTarget: {} });
  await flush();
  expect(call).toHaveBeenCalledWith("creatorFollow", {
    organizationId: "workspace",
    profileUrl: follow.canonical,
    mode: "future",
    route: "save_only",
    maxAssets: 30,
    maxVideoMs: 600000,
    timezone: "UTC",
    digestHour: 9,
    rightsAttested: true,
  });
  expect(
    call.mock.calls.every(([operation]) =>
      ["creatorFollowing", "creatorFollow"].includes(operation),
    ),
  ).toBe(true);
});
it("allows the shown bounded subset despite excluded posts and preserves backend stale-quote refusal", async () => {
  const quote = {
    hash: "bounded-subset-hash",
    posts: [
      {
        postId: "included",
        canonical: delivery.canonical,
        publishedAt: 100,
        assetCount: 1,
      },
    ],
    assets: 1,
    videoMs: 0,
    needsReview: 0,
    overLimit: 3,
    incomplete: false,
    processingStarted: false,
  };
  const call = vi.fn(async (operation: string) => {
    if (operation === "creatorPreviewBackfill") return quote;
    if (operation === "creatorApproveBackfill")
      throw Error("QUOTE_CHANGED: refresh the observed subset");
    return following;
  });
  const props = { organizationId: "workspace", call };
  let tree = await mount(CreatorFollowing, props);
  await button(tree, "Review observed latest-ten posts").props.onClick();
  tree = render(CreatorFollowing, props);
  expect(text(tree)).toContain(
    "3 other observed posts exceed the remaining daily limits and are excluded",
  );
  expect(text(tree)).toContain("Approval adds only the shown subset");
  expect(button(tree, "Approve these metadata additions").props.disabled).toBe(
    false,
  );
  await button(tree, "Approve these metadata additions").props.onClick();
  await flush();
  expect(call).toHaveBeenCalledWith("creatorApproveBackfill", {
    id: follow._id,
    expectedVersion: 4,
    quoteHash: "bounded-subset-hash",
    acceptIncomplete: false,
  });
  expect(text(render(CreatorFollowing, props))).toContain("QUOTE_CHANGED");
  expect(
    call.mock.calls.filter(([operation]) => operation === "creatorFollowing"),
  ).toHaveLength(1);
});
it("keeps an empty bounded quote blocked even when excluded posts exist", async () => {
  const call = vi.fn(async (operation: string) =>
    operation === "creatorPreviewBackfill"
      ? {
          hash: "empty",
          posts: [],
          assets: 0,
          videoMs: 0,
          needsReview: 0,
          overLimit: 3,
          incomplete: false,
          processingStarted: false,
        }
      : following,
  );
  const props = { organizationId: "workspace", call };
  let tree = await mount(CreatorFollowing, props);
  await button(tree, "Review observed latest-ten posts").props.onClick();
  tree = render(CreatorFollowing, props);
  expect(button(tree, "Approve these metadata additions").props.disabled).toBe(
    true,
  );
  expect(
    call.mock.calls.some(
      ([operation]) => operation === "creatorApproveBackfill",
    ),
  ).toBe(false);
});
