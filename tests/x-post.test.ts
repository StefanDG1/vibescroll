import { expect, it } from "vitest";
import { xPostUrl } from "../packages/media/x-identity.mjs";
import { acquisitionPolicy } from "../packages/media/acquisition";
import {
  makePreparedEvidence,
  validatePreparedEvidence,
} from "../packages/contracts/prepared-evidence";
import {
  neutralCloudObservations,
  neutralCloudEvidence,
} from "../packages/contracts/cloud-catalog";
import { preparedCreditQuote } from "../packages/contracts/prepared-service";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { socialHash } from "../packages/social/contracts";
import { socialCitation } from "../packages/social/analysis";
import type { XPostEvidence } from "../packages/social/x-post";

const canonical = "https://x.com/i/web/status/1234567890123456789";
it("canonicalizes X media selectors to the complete post without accepting arbitrary URLs", () => {
  for (const url of [
    canonical,
    "https://twitter.com/creator/status/1234567890123456789/video/1?s=20",
    "https://x.com/other/status/1234567890123456789/photo/4",
  ])
    expect(acquisitionPolicy(url)).toMatchObject({
      platform: "x",
      url: canonical,
    });
  for (const url of [
    "http://x.com/a/status/123",
    "https://x.com/home",
    "https://x.com/a/status/123/../456",
    "https://x.com/a/status/123%2fvideo/1",
    "https://x.com.evil.test/a/status/123",
    "https://user@x.com/a/status/123",
    "https://x.com/a/status/123/video/0",
  ])
    expect(() => xPostUrl(url)).toThrow();
});

async function fixture(
  assets: XPostEvidence["assets"] = [],
  text = "A full post.\n" + "Long text and emoji 🐦. ".repeat(350),
) {
  const post: XPostEvidence = {
    version: "x-post-evidence-v1",
    postId: "1234567890123456789",
    provider: "gallery-dl",
    text,
    textHash: await socialHash(text),
    expectedAssetCount: assets.length,
    coverage: "complete_manifest",
    assets,
  };
  return makePreparedEvidence({
    requestedCanonical: canonical,
    canonical,
    platform: "x",
    post,
    sourceHash: await socialHash(canonicalJson({ canonical, text, assets })),
    recipeHash: "b".repeat(64),
    downloaderVersion: "gallery-dl/1.32.19",
    title: "Post",
    authorName: "Author",
    durationMs: assets.reduce(
      (n, a) => n + (a.kind === "video" ? a.durationMs : 0),
      0,
    ),
    language: "und",
    observedAt: Date.now(),
    transcript: {
      origin: "none",
      model: null,
      provider: null,
      inputSha256: null,
    },
    segments: [],
    frames: assets.map((a) => ({
      id: `${a.id}-frame-000`,
      assetId: a.id,
      assetIndex: a.index,
      timestampMs: 0,
      sha256: "d".repeat(64),
      bytes: 500,
      width: 480,
      height: 640,
    })),
  });
}
it("retains complete long text and permits zero media with null-time caption citations", async () => {
  const value = await fixture(),
    observations = neutralCloudObservations(value.evidence);
  expect(value.evidence.frames).toEqual([]);
  expect(value.evidence.durationMs).toBe(0);
  expect(observations.map((o) => o.text).join("")).toBe(
    value.evidence.post!.text,
  );
  for (const o of observations)
    expect(
      socialCitation(
        { kind: "caption", id: o.id, startMs: null, endMs: null },
        observations,
      ),
    ).toMatchObject({ kind: "caption", assetId: "post" });
  expect(
    preparedCreditQuote(0, "work_cloud", false, undefined, "post"),
  ).toEqual({ preparation: 1, analysis: 0, maximum: 1 });
  expect(() => preparedCreditQuote(0, "work_cloud", false)).toThrow();
  const changed = structuredClone(value);
  changed.evidence.post!.text += "changed";
  await expect(validatePreparedEvidence(changed)).rejects.toThrow(/COVERAGE/);
  expect(() =>
    neutralCloudEvidence.parse({
      ...value.evidence,
      version: "neutral-cloud-evidence-v1",
      post: undefined,
    }),
  ).toThrow();
});
it("binds all images and videos to distinct assets and rejects missing or mistyped attachments", async () => {
  const common = {
    contentHash: "c".repeat(64),
    bytes: 1000,
    width: 640,
    height: 480,
  };
  const value = await fixture(
    [
      { ...common, id: "asset-1", index: 0, kind: "image", mime: "image/png" },
      {
        ...common,
        id: "asset-2",
        index: 1,
        kind: "video",
        mime: "video/mp4",
        durationMs: 10000,
        animated: false,
        audioStatus: "silent",
      },
      {
        ...common,
        id: "asset-3",
        index: 2,
        kind: "video",
        mime: "video/mp4",
        durationMs: 2000,
        animated: true,
        audioStatus: "none",
      },
    ],
    "Caption",
  );
  const obs = neutralCloudObservations(value.evidence);
  expect(obs.map((o) => o.kind)).toEqual([
    "caption",
    "image_observation",
    "video_observation",
    "video_observation",
  ]);
  expect(obs[1].startMs).toBeNull();
  expect(obs[2].assetId).toBe("asset-2");
  const missing = structuredClone(value);
  missing.evidence.frames.pop();
  await expect(validatePreparedEvidence(missing)).rejects.toThrow(/COVERAGE/);
  const wrong = structuredClone(value);
  wrong.evidence.observations[2].kind = "image_observation";
  await expect(validatePreparedEvidence(wrong)).rejects.toThrow(/REFERENCE/);
  const outside = structuredClone(value);
  outside.evidence.frames[2].timestampMs = 2000;
  await expect(validatePreparedEvidence(outside)).rejects.toThrow(/COVERAGE/);
});
