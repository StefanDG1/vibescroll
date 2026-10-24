import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import type { ServiceCatalogCard } from "../../packages/social/catalog";
const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effectIndex: 0,
  effects: [] as {
    deps: unknown[];
    cleanup?: () => void;
    run?: () => unknown;
  }[],
}));
// Exercise the component's actual event handlers and cleanup without a DOM dependency.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const index = hooks.index++;
    if (!(index in hooks.cells))
      hooks.cells[index] = typeof initial === "function" ? initial() : initial;
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
  useEffect: (run: () => unknown, deps: unknown[]) => {
    const index = hooks.effectIndex++;
    const old = hooks.effects[index];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      old?.cleanup?.();
      hooks.effects[index] = { deps, run };
    }
  },
}));
import {
  ServiceCatalog,
  ServiceCatalogPanel,
  type ServiceCatalogProps,
} from "./components/service-catalog";
import { ServiceCatalogMap } from "./components/service-catalog-map";
type Node = ReactElement<Record<string, any>>;
const now = 1_800_000_000_000;
const card: ServiceCatalogCard = {
  artifactId: "artifact-one",
  compatibilityKey: "a".repeat(64),
  title: "Cited idea",
  summary: "Neutral source summary",
  summaryTruncated: false,
  sourceUrl: "https://www.instagram.com/p/example/",
  platform: "instagram",
  language: "en",
  insightCount: 1,
  availableUntil: now + 60000,
  categories: ["product_design"],
  topics: ["first useful screen"],
  creatorId: "public-creator-123",
  publishedAt: now - 86400000,
};
const page = {
  version: "service-catalog-v2",
  availability: "ready",
  page: [card],
  continueCursor: null,
  isDone: true,
  query: null,
  searchCoverage: "indexed-eligible-generic-analysis",
};
const detail = {
  title: card.title,
  sourceUrl: card.sourceUrl,
  summary: card.summary,
  insights: [],
  warnings: [],
  inspectedAssetCount: 1,
  expectedAssetCount: 1,
  acquisitionCoverage: "complete_manifest",
  schemaVersion: "3.0.0",
  coverage: "ordered_media",
  language: "en",
  pipelineVersion: "synthetic",
};
function render(props: ServiceCatalogProps) {
  hooks.index = 0;
  hooks.effectIndex = 0;
  const tree = ServiceCatalogPanel(props);
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
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.cells = [];
  hooks.effects = [];
  hooks.index = 0;
  hooks.effectIndex = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("makes no request on mount or while closed and explains Pro and retained-copy boundaries", async () => {
  const call = vi.fn();
  const props = { organizationId: "private", call };
  const tree = render(props);
  expect(call).not.toHaveBeenCalled();
  expect(text(tree)).toContain("Contributing does not unlock");
  expect(text(tree)).toContain("remain readable after Pro ends");
  await vi.advanceTimersByTimeAsync(60000);
  expect(call).not.toHaveBeenCalled();
  expect(button(tree, "Browse catalog").props.disabled).toBe(false);
});
it("fences the mounted scope by workspace, entitlement revision and disabled state without depending on callback identity", () => {
  const call = vi.fn();
  const first = ServiceCatalog({
    organizationId: "one",
    call,
    entitlementKey: "a",
  });
  expect(
    ServiceCatalog({
      organizationId: "one",
      call: vi.fn(),
      entitlementKey: "a",
    }).key,
  ).toBe(first.key);
  expect(
    ServiceCatalog({ organizationId: "two", call, entitlementKey: "a" }).key,
  ).not.toBe(first.key);
  expect(
    ServiceCatalog({ organizationId: "one", call, entitlementKey: "b" }).key,
  ).not.toBe(first.key);
  expect(
    ServiceCatalog({
      organizationId: "one",
      call,
      entitlementKey: "a",
      disabled: true,
    }).key,
  ).not.toBe(first.key);
});
it("preserves empty filtered continuation and loads only the explicitly requested next page", async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce({
      ...page,
      page: [],
      continueCursor: "opaque-next",
      isDone: false,
    })
    .mockResolvedValueOnce(page);
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  let tree = render(props);
  expect(text(tree)).toContain("Another catalog page is available");
  expect(text(tree)).not.toContain("No eligible analyses are available");
  expect(call).toHaveBeenCalledTimes(1);
  await click(tree, "Next catalog page");
  tree = render(props);
  expect(call.mock.calls).toEqual([
    ["serviceArtifactBrowse", { organizationId: "private", cursor: null }],
    [
      "serviceArtifactBrowse",
      { organizationId: "private", cursor: "opaque-next" },
    ],
  ]);
  expect(text(tree)).toContain(card.summary);
});
it("requires inspect then an explicit exact-key save and starts no analysis", async () => {
  const call = vi.fn(async (operation) =>
    operation === "serviceArtifactBrowse"
      ? page
      : operation === "serviceArtifactPreview"
        ? detail
        : {
            sourceId: "private-copy",
            chargedCredits: 0,
            processingStarted: false,
          },
  );
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  await click(render(props), "Inspect Cited idea");
  expect(call).toHaveBeenCalledTimes(2);
  await click(render(props), "Save private copy");
  expect(call.mock.calls[2]).toEqual([
    "serviceArtifactSave",
    {
      organizationId: "private",
      artifactId: card.artifactId,
      expectedCompatibilityKey: card.compatibilityKey,
    },
  ]);
  expect(text(render(props))).toContain("Private copy saved to your Library");
});
it("clears catalog cards and selected detail on a rejected save or downgrade", async () => {
  const call = vi.fn(async (operation) => {
    if (operation === "serviceArtifactBrowse") return page;
    if (operation === "serviceArtifactPreview") return detail;
    throw Error("Current Pro required");
  });
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  await click(render(props), "Inspect Cited idea");
  await click(render(props), "Save private copy");
  const tree = render(props);
  expect(text(tree)).toContain("Catalog access could not be confirmed");
  expect(text(tree)).not.toContain(card.summary);
  expect(
    elements(tree).some(
      (item) => item.props["aria-label"] === "Selected catalog analysis",
    ),
  ).toBe(false);
});
it("ignores a browse response after closing and a preview response after detail dismissal", async () => {
  const response = deferred();
  const call = vi
    .fn()
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce(page);
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  await click(render(props), "Close catalog");
  response.resolve(page);
  await flush();
  expect(text(render(props))).not.toContain(card.summary);
  await click(render(props), "Browse catalog");
  const preview = deferred();
  call.mockReturnValueOnce(preview.promise);
  await click(render(props), "Inspect Cited idea");
  await click(render(props), "Close analysis");
  preview.resolve(detail);
  await flush();
  expect(
    elements(render(props)).some(
      (item) => item.props["aria-label"] === "Selected catalog analysis",
    ),
  ).toBe(false);
});
it("ignores in-flight data after workspace unmount without more requests", async () => {
  const response = deferred();
  const call = vi.fn().mockReturnValue(response.promise);
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  for (const effect of hooks.effects) effect.cleanup?.();
  response.resolve(page);
  await flush();
  expect(
    hooks.cells.some((value) => value?.version === "service-catalog-v2"),
  ).toBe(false);
  expect(call).toHaveBeenCalledTimes(1);
});
it("disables expired cards at their deadline and also rejects a stale captured click handler", async () => {
  const call = vi.fn().mockResolvedValue(page);
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  const previous = render(props);
  const inspect = button(previous, "Inspect Cited idea");
  await vi.advanceTimersByTimeAsync(60000);
  expect(button(render(props), "Inspect Cited idea").props.disabled).toBe(true);
  inspect.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(1);
});
it("keeps unavailable and malformed responses distinct from an empty ready page", async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce({ ...page, availability: "unavailable", page: [] })
    .mockResolvedValueOnce({
      ...page,
      page: [card, card, card, card, card, card],
    });
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  expect(text(render(props))).toContain("The catalog is unavailable");
  await click(render(props), "Refresh catalog");
  expect(text(render(props))).toContain(
    "Catalog access could not be confirmed",
  );
  expect(text(render(props))).not.toContain(card.summary);
});

it("cannot reuse an old save handler after detail dismissal or panel close", async () => {
  const call = vi.fn(async (operation) =>
    operation === "serviceArtifactBrowse" ? page : detail,
  );
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  await click(render(props), "Inspect Cited idea");
  const tree = render(props);
  const save = button(tree, "Save private copy");
  await click(tree, "Close analysis");
  save.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(2);
  await click(render(props), "Close catalog");
  save.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(2);
});

it("blocks disabled or duplicate pending requests, including captured handlers after unmount", async () => {
  const response = deferred();
  const call = vi.fn().mockReturnValue(response.promise);
  const props = { organizationId: "private", call };
  await click(render({ ...props, disabled: true }), "Browse catalog");
  expect(call).not.toHaveBeenCalled();
  const open = button(render(props), "Browse catalog");
  open.props.onClick();
  open.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(1);
  for (const effect of hooks.effects) effect.cleanup?.();
  open.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(1);
  response.resolve(page);
  await flush();
});

function searchInput(tree: unknown) {
  const input = elements(tree).find(
    (node) => node.type === "input" && node.props.type === "search",
  );
  expect(input).toBeDefined();
  return input!;
}
async function submit(tree: unknown) {
  const form = elements(tree).find((node) => node.type === "form");
  expect(form).toBeDefined();
  form!.props.onSubmit({ preventDefault: vi.fn() });
  await flush();
}
it("searches only on submission, drops old continuation, and ignores an in-flight prior query", async () => {
  const old = deferred();
  const call = vi
    .fn()
    .mockResolvedValueOnce({
      ...page,
      continueCursor: "old-page",
      isDone: false,
    })
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ ...page, query: "new phrase" });
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  const oldNext = button(render(props), "Next catalog page");
  searchInput(render(props)).props.onChange({
    target: { value: "old phrase" },
  });
  expect(call).toHaveBeenCalledTimes(1);
  await submit(render(props));
  searchInput(render(props)).props.onChange({
    target: { value: "new phrase" },
  });
  expect(text(render(props))).not.toContain(card.summary);
  oldNext.props.onClick();
  await flush();
  expect(call).toHaveBeenCalledTimes(2);
  await submit(render(props));
  old.resolve({
    ...page,
    query: "old phrase",
    page: [{ ...card, summary: "Stale prior query" }],
  });
  await flush();
  expect(text(render(props))).not.toContain("Stale prior query");
  expect(text(render(props))).toContain("Search phrase: new phrase");
  expect(call.mock.calls[2]).toEqual([
    "serviceArtifactBrowse",
    { organizationId: "private", cursor: null, query: "new phrase" },
  ]);
});
it("binds search pagination to its phrase and resets to browse with no cursor", async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({
      ...page,
      query: "design",
      page: [],
      continueCursor: "search-page",
      isDone: false,
    })
    .mockResolvedValueOnce({ ...page, query: "design" })
    .mockResolvedValueOnce(page);
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  searchInput(render(props)).props.onChange({ target: { value: " design " } });
  await submit(render(props));
  expect(text(render(props))).toContain("Another catalog page is available");
  await click(render(props), "Next catalog page");
  expect(call.mock.calls[2][1]).toEqual({
    organizationId: "private",
    cursor: "search-page",
    query: "design",
  });
  await click(render(props), "Reset search");
  expect(call.mock.calls[3][1]).toEqual({
    organizationId: "private",
    cursor: null,
  });
  expect(searchInput(render(props)).props.value).toBe("");
});
it("shows generic public provenance and filters only the checked page without requests", async () => {
  const other = {
    ...card,
    artifactId: "second",
    title: "Other idea",
    categories: ["coding"],
    topics: [],
    creatorId: "another-public-id",
    publishedAt: null,
  };
  const call = vi.fn().mockResolvedValue({ ...page, page: [card, other] });
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  let tree = render(props);
  expect(text(tree)).toContain("Public creator reference: public-creator-123");
  expect(text(tree)).toContain("Publication date unverified");
  expect(text(tree)).toContain("Generic topics: first useful screen");
  const filter = elements(tree).find((node) => node.type === "select");
  expect(text(tree)).toContain("Filter only this checked page");
  filter!.props.onChange({ target: { value: "product_design" } });
  tree = render(props);
  expect(text(tree)).toContain(card.summary);
  expect(text(tree)).not.toContain("Other idea");
  expect(call).toHaveBeenCalledTimes(1);
  const map = elements(tree).find((node) => node.type === ServiceCatalogMap);
  expect(map!.props.cards).toHaveLength(1);
});
it("builds a bounded category membership list and optional static map with no private identity inputs", () => {
  const cards = Array.from({ length: 5 }, (_, index) => ({
    ...card,
    artifactId: `artifact-${index}`,
    title: `Analysis ${index}`,
    categories: [
      `category-${index}`,
      ...Array.from({ length: 8 }, (_, category) => `shared-${category}`),
    ],
  }));
  const tree = ServiceCatalogMap({ cards });
  expect(text(tree)).toContain("not a similarity judgment");
  expect(text(tree)).toContain("first nine categories");
  expect(text(tree)).toContain("Analysis 4");
  const svg = elements(tree).find((node) => node.type === "svg");
  expect(svg!.props["aria-hidden"]).toBe("true");
  expect(elements(tree).filter((node) => node.type === "circle")).toHaveLength(
    9,
  );
  expect(elements(tree).filter((node) => node.type === "rect")).toHaveLength(5);
  expect(text(tree)).not.toContain(card.creatorId);
});
it("clears metadata and map on denial and refuses legacy or mismatched-query search responses", async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(Error("Pro ended"))
    .mockResolvedValueOnce({ ...page, version: "service-catalog-v1" })
    .mockResolvedValueOnce({ ...page, query: "unexpected" });
  const props = { organizationId: "private", call };
  await click(render(props), "Browse catalog");
  expect(
    elements(render(props)).some((node) => node.type === ServiceCatalogMap),
  ).toBe(true);
  await click(render(props), "Refresh catalog");
  expect(
    elements(render(props)).some((node) => node.type === ServiceCatalogMap),
  ).toBe(false);
  expect(text(render(props))).not.toContain(card.creatorId);
  await click(render(props), "Refresh catalog");
  expect(text(render(props))).toContain(
    "Catalog access could not be confirmed",
  );
  await click(render(props), "Refresh catalog");
  expect(text(render(props))).not.toContain(card.summary);
});
