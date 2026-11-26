import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { reciprocalCreatorComponent } from "../packages/social/creator-identity";
import { fixture } from "./chat-proposal-fixture";
import { orderedRevisionHash } from "../packages/social/contracts";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const a = {
  key: "instagram:123",
  handle: "example",
  links: ["https://www.tiktok.com/@different"],
  observedAt: Date.now(),
};
const b = {
  key: "tiktok:456",
  handle: "different",
  links: ["https://www.instagram.com/example/"],
  observedAt: Date.now(),
};

it("recovers an exact legacy private post's creator without publishing or changing its selected result", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  vi.stubEnv("VIBESCROLL_CREATOR_MATCHING_ENABLED", "true");
  await f.t.run((c) => c.db.patch(f.sourceId, { creator: undefined }));
  const before = (await f.t.run((c) => c.db.get(f.sourceId)))!;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          `<div class="Embed" data-owner-id="12345" data-media-id="1234567" data-media-type="GraphVideo" data-permalink="${before.canonical}"><a class="Username" href="https://www.instagram.com/creator/">Creator</a><a class="EmbeddedMedia" href="${before.canonical}"></a></div>`,
        ),
    ),
  );
  expect(
    await f.t.action(internal.creatorProfiles.repairSavedSource, {
      sourceId: f.sourceId,
    }),
  ).toBe(true);
  const after = (await f.t.run((c) => c.db.get(f.sourceId)))!;
  expect(after.creator).toEqual({
    key: "instagram:12345",
    handle: "creator",
    generation: before.generation,
  });
  expect({
    ...after,
    creator: before.creator,
    platformPostKey: before.platformPostKey,
  }).toEqual(before);
  expect(after.publicImportId).toBeUndefined();
  expect(
    await f.t.action(internal.creatorProfiles.repairSavedSource, {
      sourceId: f.sourceId,
    }),
  ).toBe(false);
  vi.unstubAllGlobals();
});

it("requires reciprocal public links, including for accounts with identical handles", () => {
  expect(reciprocalCreatorComponent([a, b], a.key)).toEqual([a.key, b.key]);
  expect(reciprocalCreatorComponent([a, { ...b, links: [] }], a.key)).toEqual([
    a.key,
  ]);
  expect(
    reciprocalCreatorComponent(
      [
        { ...a, links: [] },
        { ...b, handle: "example", links: [] },
      ],
      a.key,
    ),
  ).toEqual([a.key]);
});

it("coalesces profile reads and refuses stale or changed observations", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  vi.stubEnv("VIBESCROLL_CREATOR_MATCHING_ENABLED", "true");
  const args = { key: a.key, handle: a.handle };
  const first = await f.t.mutation(internal.creatorProfiles.acquire, args);
  if (!first?.token) throw Error("Expected a profile lease");
  expect(first.token).toBeTypeOf("string");
  expect(await f.t.mutation(internal.creatorProfiles.acquire, args)).toBeNull();
  expect(
    await f.t.mutation(internal.creatorProfiles.retain, {
      key: a.key,
      token: "wrong-token",
      profile: a,
    }),
  ).toBe(false);
  await expect(
    f.t.mutation(internal.creatorProfiles.retain, {
      key: a.key,
      token: first.token,
      profile: { ...a, key: b.key },
    }),
  ).rejects.toThrow();
  const profile = { ...a, observedAt: Date.now() };
  expect(
    await f.t.mutation(internal.creatorProfiles.retain, {
      key: a.key,
      token: first.token,
      profile,
    }),
  ).toBe(true);
  expect(await f.t.mutation(internal.creatorProfiles.acquire, args)).toEqual({
    profile,
  });
});

it("groups verified account evidence, exposes both creator posts and keeps workspace access", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  vi.stubEnv("VIBESCROLL_CREATOR_MATCHING_ENABLED", "true");
  const profiles = [a, b].map((p) => ({ ...p, observedAt: Date.now() }));
  const generation = await f.t.run(async (c) => {
    const source = (await c.db.get(f.sourceId))!;
    await c.db.patch(source._id, {
      creator: { key: a.key, handle: a.handle, generation: source.generation },
    });
    // A second retained private metadata fixture with its own source/version/evidence.
    const { _id: _s, _creationTime: _st, ...fields } = source;
    const canonical =
      "https://www.tiktok.com/@different/video/7553302113757990166";
    const post = {
      ...source.orderedMedia!.post,
      canonical,
      platform: "tiktok" as const,
    };
    post.revisionHash = await orderedRevisionHash(post);
    const secondId = await c.db.insert("sources", {
      ...fields,
      canonical,
      url: canonical,
      creator: { key: b.key, handle: b.handle, generation: source.generation },
      orderedMedia: { ...source.orderedMedia!, post },
    });
    const version = (await c.db.get(source.selectedAnalysisVersionId!))!;
    const evidence = (await c.db.get(version.evidenceId))!;
    const { _id: _e, _creationTime: _et, ...evidenceFields } = evidence;
    const evidenceId = await c.db.insert("analysisEvidence", {
      ...evidenceFields,
      sourceId: secondId,
      canonical,
      revisionHash: post.revisionHash,
      prepared: { ...evidence.prepared, post },
    });
    const { _id: _v, _creationTime: _vt, ...versionFields } = version;
    const versionId = await c.db.insert("analysisVersions", {
      ...versionFields,
      sourceId: secondId,
      evidenceId,
    });
    await c.db.patch(secondId, { selectedAnalysisVersionId: versionId });
    return source.generation;
  });
  for (const profile of profiles) {
    const acquired = await f.t.mutation(internal.creatorProfiles.acquire, {
      key: profile.key,
      handle: profile.handle,
    });
    if (!acquired?.token) throw Error("Expected profile lease");
    await f.t.mutation(internal.creatorProfiles.retain, {
      key: profile.key,
      token: acquired.token,
      profile,
    });
  }
  expect(
    await f.t.mutation(internal.creatorProfiles.group, {
      sourceId: f.sourceId,
      generation,
      profiles,
    }),
  ).toBe(true);
  const args = { organizationId: f.org, creatorKey: a.key };
  const page = await f.owner.query(api.creators.read, args);
  expect(page?.items).toHaveLength(2);
  expect(page?.handle).toBe(a.handle);
  await expect(
    f.t
      .withIdentity({ subject: "user_foreign" })
      .query(api.creators.read, args),
  ).rejects.toThrow();
  vi.advanceTimersByTime(8 * 86400000);
  expect(
    (await f.owner.query(api.creators.read, args))?.items ?? [],
  ).toHaveLength(0);
});

it("never groups a deleted source, another generation or unretained profile evidence", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  vi.stubEnv("VIBESCROLL_CREATOR_MATCHING_ENABLED", "true");
  await f.t.run(async (c) => {
    const source = (await c.db.get(f.sourceId))!;
    await c.db.patch(f.sourceId, {
      creator: { key: a.key, handle: a.handle, generation: source.generation },
    });
  });
  const generation = (await f.t.run((c) => c.db.get(f.sourceId)))!.generation;
  expect(
    await f.t.mutation(internal.creatorProfiles.group, {
      sourceId: f.sourceId,
      generation: generation + 1,
      profiles: [a, b],
    }),
  ).toBe(false);
  await expect(
    f.t.mutation(internal.creatorProfiles.group, {
      sourceId: f.sourceId,
      generation,
      profiles: [
        { ...a, observedAt: Date.now() },
        { ...b, observedAt: Date.now() },
      ],
    }),
  ).rejects.toThrow("evidence changed");
  await f.t.run((c) => c.db.patch(f.sourceId, { state: "deleted" }));
  expect(
    await f.t.mutation(internal.creatorProfiles.group, {
      sourceId: f.sourceId,
      generation,
      profiles: [a, b],
    }),
  ).toBe(false);
});
