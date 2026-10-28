import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { postDisplayTitle } from "../packages/sources/display";
import { postThumbnailCandidates } from "../packages/sources/thumbnail";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  for (const subject of ["posts-owner", "posts-other"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: `${subject}@example.test`,
      name: subject,
    });
  const owner = t.withIdentity({ subject: "posts-owner" });
  const other = t.withIdentity({ subject: "posts-other" });
  const org = await owner.mutation(api.organizations.create, {
    name: "Synthetic posts",
  });
  const otherOrg = await other.mutation(api.organizations.create, {
    name: "Other posts",
  });
  const ids = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 43; i++)
      ids.push(
        await ctx.db.insert("sources", {
          organizationId: org,
          key: `post-${i}`,
          canonical: `https://www.instagram.com/reel/Post${i}/`,
          url: `https://www.instagram.com/reel/Post${i}/`,
          title: `Instagram Reel Post${i}`,
          kind: "url",
          state: i === 42 ? "deleted" : "ready",
          generation: 0,
          coverage: "full",
          tags: [],
          rightsAttested: true,
          createdAt: i,
          updatedAt: i,
          ...(i === 41 ? { sourceRetentionUntil: Date.now() - 1 } : {}),
          text: "PRIVATE_TRANSCRIPT",
          analysis: { private: "PRIVATE_ANALYSIS" },
          personalMedia: { audio: { secret: "PRIVATE_MEDIA_BUNDLE" } },
          linkPreview: {
            title: `Native post ${i}`,
            authorName: "Native author",
            state: "ready",
            updatedAt: 1000 + i,
          },
        }),
      );
    await ctx.db.insert("sources", {
      organizationId: otherOrg,
      key: "other",
      canonical: "other",
      title: "OTHER_TENANT",
      kind: "text",
      state: "saved",
      generation: 0,
      coverage: "none",
      tags: [],
      rightsAttested: true,
      createdAt: 99,
      updatedAt: 99,
    });
    return ids;
  });
  return { t, owner, other, org, ids };
}

it("paginates metadata by creation time without analysis/media payloads or hidden sources", async () => {
  const { owner, org } = await setup();
  let cursor: string | undefined;
  const titles: string[] = [];
  for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
    const page = await owner.query(api.posts.recent, {
      organizationId: org,
      cursor,
    });
    expect(page.items.length).toBeLessThanOrEqual(20);
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          "id",
          "title",
          "authorName",
          "kind",
          "state",
          "generation",
          "createdAt",
          "metadataUpdatedAt",
          "thumbnailAssetIds",
        ].sort(),
      );
      expect(item.metadataUpdatedAt).toBeGreaterThan(item.createdAt);
    }
    expect(JSON.stringify(page)).not.toMatch(/PRIVATE_|OTHER_TENANT/);
    titles.push(...page.items.map((post) => post.title));
    cursor = page.next ?? undefined;
  }
  expect(cursor).toBeUndefined();
  expect(titles).toEqual(
    Array.from({ length: 41 }, (_, i) => `Native post ${40 - i}`),
  );
});

it("denies anonymous, other-tenant, MCP and recovery-locked requests", async () => {
  const { t, other, owner, org } = await setup();
  await expect(
    t.query(api.posts.recent, { organizationId: org }),
  ).rejects.toThrow();
  await expect(
    other.query(api.posts.recent, { organizationId: org }),
  ).rejects.toThrow();
  vi.stubEnv("MCP_AUTH_ISSUER", "https://synthetic-test.authkit.app");
  await expect(
    t
      .withIdentity({
        subject: "posts-owner",
        issuer: "https://synthetic-test.authkit.app",
        client_id: "client_synthetic",
        scope: "knowledge:read",
      })
      .query(api.posts.recent, { organizationId: org }),
  ).rejects.toThrow();
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    owner.query(api.posts.recent, { organizationId: org }),
  ).rejects.toThrow();
});

it("prefers actual native titles only over exact generated placeholders", () => {
  const url = "https://www.instagram.com/reel/Native123/";
  expect(
    postDisplayTitle({
      url,
      title: "Instagram Reel Native123",
      linkPreview: { title: "Actual title" },
    }),
  ).toBe("Actual title");
  expect(
    postDisplayTitle({
      url,
      title: "My own title",
      linkPreview: { title: "Actual title" },
    }),
  ).toBe("My own title");
  expect(
    postDisplayTitle({
      url,
      title: "Instagram Reel Different123",
      linkPreview: { title: "Actual title" },
    }),
  ).toBe("Instagram Reel Different123");
  expect(
    postDisplayTitle({
      url: "https://instagram.com.evil.test/reel/Native123/",
      title: "Instagram Reel Native123",
      linkPreview: { title: "Other" },
    }),
  ).toBe("Instagram Reel Native123");
  expect(
    postDisplayTitle({
      url: "https://www.tiktok.com/@creator/video/123456789",
      title: "TikTok video 123456789",
      linkPreview: { title: "TikTok native" },
    }),
  ).toBe("TikTok native");
  expect(postDisplayTitle({ linkPreview: { title: "Preview only" } })).toBe(
    "Preview only",
  );
});

it("offers a bounded durable thumbnail fallback and suppresses revoked or expired images", () => {
  const source = {
    rightsAttested: true,
    state: "ready",
    linkPreview: { assetId: "preview" },
    mediaEvidence: [{ kind: "frame", id: "sampled" }],
    personalMedia: { frames: [{ assetId: "local" }] },
  };
  expect(postThumbnailCandidates(source)).toEqual([
    "preview",
    "sampled",
    "local",
  ]);
  expect(postThumbnailCandidates({ ...source, rightsAttested: false })).toEqual(
    [],
  );
  expect(postThumbnailCandidates({ ...source, state: "deleted" })).toEqual([]);
  expect(
    postThumbnailCandidates({
      ...source,
      sourceRetentionUntil: Date.now() - 1,
    }),
  ).toEqual([]);
  expect(
    postThumbnailCandidates({ ...source, linkPreview: { assetId: "sampled" } }),
  ).toEqual(["sampled", "local"]);
});
