import { afterEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  value: null as any,
  ref: null as any,
  deps: [] as unknown[],
  cleanup: undefined as any,
}));
vi.mock("react", () => ({
  useState: () => [
    hooks.value,
    (value: unknown) => {
      hooks.value = value;
    },
  ],
  useRef: (initial: unknown) => (hooks.ref ??= { current: initial }),
  useEffect: (effect: () => unknown, deps: unknown[]) => {
    if (deps.some((value, i) => !Object.is(value, hooks.deps[i]))) {
      hooks.cleanup?.();
      hooks.deps = deps;
      hooks.cleanup = effect();
    }
  },
}));
import { useSourceMedia } from "./source-media";
const source = {
  id: "source",
  title: "Post",
  state: "ready",
  generation: 1,
  revision: 2,
  url: "https://scroll.companynerve.com/app/team/posts/source",
  insights: [],
  analysisVersionId: "version",
};
const page = {
  id: "source@version",
  title: "Post",
  text: "Retained context",
  format: "post_context_v1",
  profile_id: "team",
  grant_version: 7,
  more_ideas: false,
  url: source.url,
  scope_notice: "Current scope",
  context: {
    schemaVersion: "post-context-v1",
    sourceId: "source",
    analysisVersionId: "version",
    evidenceHash: "a".repeat(64),
    revisionHash: "b".repeat(64),
    outputHash: "c".repeat(64),
    canonical: "https://www.instagram.com/reel/fixture/",
    platform: "instagram",
    authorName: "Retained author",
    durationMs: 12000,
    provenance: "service",
    summary: "Retained summary",
    warnings: [],
    coverage: "sampled",
    frames: [
      {
        frameId: "frame",
        timestampMs: 1000,
        sha256: "d".repeat(64),
        size: 1000,
        width: 320,
        height: 480,
      },
    ],
    totals: { transcript: 3, observations: 1, insights: 1 },
    items: [],
    offset: 0,
    next_cursor: "remaining-context",
    complete: false,
    coverage_notice: "Bounded first page",
  },
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
afterEach(() => {
  hooks.cleanup?.();
  hooks.value = hooks.ref = null;
  hooks.deps = [];
  hooks.cleanup = undefined;
});
it("loads one context page and first retained JPEG, preserving version and team-sharing authority", async () => {
  const call = vi.fn(async () => page),
    image = vi.fn(async () => "data:image/jpeg;base64,fixture");
  const shared = { ...source, sharedGrantId: "sharing", sharedGrantVersion: 4 };
  useSourceMedia(shared, "team", 7, call, image);
  await settle();
  expect(call).toHaveBeenCalledWith("fetch", {
    profileId: "team",
    id: "source@version",
    format: "post_context_v1",
    sharedGrantId: "sharing",
    sharedGrantVersion: 4,
  });
  expect(image).toHaveBeenCalledWith("read_post_frame", {
    profileId: "team",
    sourceId: "source",
    analysisVersionId: "version",
    frameId: "frame",
    expectedEvidenceHash: "a".repeat(64),
    sharedGrantId: "sharing",
    sharedGrantVersion: 4,
  });
  expect(hooks.value).toMatchObject({
    authorName: "Retained author",
    durationMs: 12000,
    frameId: "frame",
  });
  useSourceMedia(shared, "team", 7, call, image);
  await settle();
  expect(call).toHaveBeenCalledTimes(1);
  expect(image).toHaveBeenCalledTimes(1);
});
it("retains real metadata after a frame failure and rejects a changed authority snapshot", async () => {
  const image = vi.fn(async () => {
    throw Error("Host frame failed");
  });
  useSourceMedia(
    source,
    "team",
    7,
    vi.fn(async () => page),
    image,
  );
  await settle();
  expect(hooks.value).toMatchObject({
    authorName: "Retained author",
    image: null,
  });
  useSourceMedia(
    source,
    "team",
    8,
    vi.fn(async () => page),
    image,
  );
  await settle();
  expect(hooks.value).toBeNull();
  expect(image).toHaveBeenCalledTimes(1);
});
