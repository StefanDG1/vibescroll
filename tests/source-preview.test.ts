import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  postPreviewMetadata,
  previewUrl,
  publicPreviewAddress,
} from "../packages/providers/source-preview";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("denies private destinations and unrelated image URLs while preserving valid escaped post metadata", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "fc00::1",
    "::ffff:8.8.8.8",
    "2001:db8::1",
  ])
    expect(publicPreviewAddress(address)).toBe(false);
  expect(publicPreviewAddress("1.1.1.1")).toBe(true);
  for (const url of [
    "http://x.cdninstagram.com/a",
    "https://x.cdninstagram.com.evil.test/a",
    "https://x.cdninstagram.com@localhost/a",
    "https://127.0.0.1/a",
    "https://x.cdninstagram.com:444/a",
  ])
    expect(() => previewUrl(url, ["*.cdninstagram.com"])).toThrow();
  expect(
    previewUrl("https://x.cdninstagram.com/a?signature=ephemeral", [
      "*.cdninstagram.com",
    ]).hostname,
  ).toBe("x.cdninstagram.com");
  const source = "https://www.instagram.com/reel/Synthetic123/";
  expect(
    postPreviewMetadata(
      `<meta property="og:url" content="${source}"><meta property="og:image" content="https://x.cdninstagram.com/a?one=1&amp;two=2"><meta property="og:title" content="Synthetic &amp; owned">`,
      source,
    ),
  ).toEqual({
    image: "https://x.cdninstagram.com/a?one=1&two=2",
    title: "Synthetic & owned",
  });
  expect(
    postPreviewMetadata(
      '<meta property="og:image" content="https://x.cdninstagram.com/logo.jpg">',
      source,
    ),
  ).toBeNull();
  expect(
    postPreviewMetadata(
      '<meta property="og:url" content="https://www.instagram.com/reel/Other123/"><meta property="og:image" content="https://x.cdninstagram.com/a">',
      source,
    ),
  ).toBeNull();
});
async function setup() {
  vi.stubEnv("LINK_PREVIEWS_ENABLED", "true");
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "preview-owner",
    email: "preview@example.test",
    name: "Synthetic preview",
  });
  const owner = t.withIdentity({ subject: "preview-owner" });
  const org = await owner.mutation(api.organizations.create, {
    name: "Synthetic preview workspace",
  });
  const id = await owner.mutation(api.product.capture, {
    organizationId: org,
    key: "synthetic-preview",
    kind: "url",
    title: "Imported video link",
    url: "https://www.instagram.com/reel/Synthetic123/",
    rightsAttested: true,
  });
  const source = await t.mutation(internal.sourcePreviewState.begin, { id });
  return { t, owner, org, id, source: source! };
}
it("keeps title and author metadata when a cover is unavailable without starting analysis", async () => {
  const { t, owner, id, source } = await setup();
  const html = `<meta property="og:url" content="${source.url}"><meta property="og:title" content="Native title"><meta name="author" content="Creator name"><meta property="video:duration" content="47">`;
  const parsed = postPreviewMetadata(html, source.url);
  expect(parsed).toMatchObject({
    title: "Native title",
    authorName: "Creator name",
    durationSeconds: 47,
  });
  await t.mutation(internal.sourcePreviewState.finish, {
    id,
    canonical: source.canonical,
    generation: source.generation,
    title: parsed!.title,
    authorName: parsed!.authorName,
    durationSeconds: parsed!.durationSeconds,
  });
  const saved = await owner.query(api.product.detail, { id });
  expect(saved.title).toBe("Native title");
  expect(saved.linkPreview).toMatchObject({
    state: "ready",
    authorName: "Creator name",
    durationSeconds: 47,
  });
  expect(saved.linkPreview?.assetId).toBeUndefined();
  expect(saved.personalAnalysis).toBeUndefined();
});
it("fences preview generation changes and preserves a user's title", async () => {
  const { t, owner, id, source } = await setup();
  await t.run((ctx) => ctx.db.patch(id, { title: "My own title" }));
  await t.mutation(internal.sourcePreviewState.finish, {
    id,
    canonical: source.canonical,
    generation: source.generation,
    title: "Native title",
  });
  expect((await owner.query(api.product.detail, { id })).title).toBe(
    "My own title",
  );
  await t.run((ctx) =>
    ctx.db.patch(id, {
      generation: source.generation + 1,
      linkPreview: { state: "loading", updatedAt: Date.now() },
    }),
  );
  expect(
    await t.mutation(internal.sourcePreviewState.finish, {
      id,
      canonical: source.canonical,
      generation: source.generation,
      title: "Stale title",
      authorName: "Stale author",
    }),
  ).toBe(false);
  expect(
    (await owner.query(api.product.detail, { id })).linkPreview?.authorName,
  ).toBeUndefined();
});
it("queues previews at capture, binds them to the original post and keeps thumbnail evidence tenant protected", async () => {
  const { t, owner, org, id, source } = await setup();
  expect(source.url).toContain("Synthetic123");
  expect(
    await t.mutation(internal.sourcePreviewState.begin, { id }),
  ).toBeNull();
  await t.run((ctx) =>
    ctx.db.patch(id, { generation: 1, state: "processing" }),
  );
  expect(
    await t.mutation(internal.sourcePreviewState.finish, {
      id,
      canonical: source.canonical,
      key: `${org}/synthetic-image`,
      size: 100,
      etag: "synthetic",
      title: "Synthetic public title",
    }),
  ).toBe(true);
  const detail = await owner.query(api.product.detail, { id });
  expect(detail.linkPreview?.state).toBe("ready");
  const asset = detail.linkPreview?.assetId;
  if (!asset) throw Error("Expected verified thumbnail asset");
  expect((await owner.query(api.assets.evidence, { id: asset })).type).toBe(
    "image/jpeg",
  );
  await expect(t.query(api.assets.evidence, { id: asset })).rejects.toThrow();
  expect(
    await t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
  await owner.mutation(api.product.deleteSource, { id });
  expect((await t.run((ctx) => ctx.db.get(id)))?.linkPreview).toBeUndefined();
  await expect(
    owner.query(api.assets.evidence, { id: asset }),
  ).rejects.toThrow();
});
it("deletion and changed post identity prevent late preview restoration and remove orphan objects", async () => {
  const { t, owner, org, id, source } = await setup();
  await owner.mutation(api.product.deleteSource, { id });
  expect(
    await t.mutation(internal.sourcePreviewState.finish, {
      id,
      canonical: source.canonical,
      key: `${org}/late-image`,
      size: 100,
      etag: "synthetic",
    }),
  ).toBe(false);
  expect(await t.run((ctx) => ctx.db.query("assets").collect())).toHaveLength(
    0,
  );
  expect(
    (await t.run((ctx) => ctx.db.query("objectDeletions").collect())).some(
      (x) => x.key === `${org}/late-image`,
    ),
  ).toBe(true);
});

it("accepts an actual provider publication timestamp but never fabricates one from import time", () => {
  const html =
    '<meta property="og:url" content="https://www.instagram.com/reel/ABCdef123/"><meta property="og:image" content="https://scontent.cdninstagram.com/image.jpg">';
  const source = "https://www.instagram.com/reel/ABCdef123/";
  expect(postPreviewMetadata(html, source)).not.toHaveProperty("publishedAt");
  expect(
    postPreviewMetadata(
      html +
        '<meta property="article:published_time" content="2026-08-01T12:00:00Z">',
      source,
    )?.publishedAt,
  ).toBe(Date.parse("2026-08-01T12:00:00Z"));
  expect(
    postPreviewMetadata(
      html +
        '<meta property="article:published_time" content="2999-01-01T00:00:00Z">',
      source,
    ),
  ).not.toHaveProperty("publishedAt");
});
