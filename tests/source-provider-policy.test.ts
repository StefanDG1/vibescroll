import { afterEach, expect, it, vi } from "vitest";
import { sourcePolicyCurrent } from "../convex/lib/sourcePolicy";
import type { SourceRevision } from "../packages/sources/types";

afterEach(() => vi.unstubAllEnvs());

function policy(now = Date.now()) {
  const eligibility = {
    status: "verified",
    evidenceId: "fixture-policy",
    expiresAt: now + 86400000,
    authentication: "oauth",
    workloads: ["selected_thread_read", "private_summary", "citation_export"],
    retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
  };
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
  vi.stubEnv("GITHUB_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "fixture-only");
  vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", JSON.stringify(eligibility));
  return eligibility;
}
function revision(
  sourceType: SourceRevision["sourceType"],
  now = Date.now(),
): SourceRevision {
  return {
    schemaVersion: "1.0.0",
    sourceType,
    canonical: "https://github.com/example/project",
    providerIdentity: "fixture",
    contentHash: "a".repeat(64),
    adapterVersion: "fixture",
    observedAt: now,
    rightsBasis: "fixture permission",
    coverage: { method: "fixture", retrieved: 1, omitted: 0, omissions: [] },
    ...(sourceType === "reddit_thread"
      ? {
          retention: {
            retainUntil: now + 3600000,
            deletionWithinMs: 3600000,
            policyEvidenceId: "fixture-policy",
          },
        }
      : {}),
  };
}

it.each(["absent", "malformed", "expired", "oauth_missing", "disabled"])(
  "keeps GitHub current without Reddit %s setup while denying Reddit",
  (change) => {
    const now = Date.now(),
      eligibility = policy(now);
    if (change === "absent") vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", "");
    if (change === "malformed")
      vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", "{");
    if (change === "expired")
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({ ...eligibility, expiresAt: now }),
      );
    if (change === "oauth_missing") vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
    if (change === "disabled") vi.stubEnv("REDDIT_SOURCES_ENABLED", "false");
    expect(sourcePolicyCurrent(revision("github_repository", now), now)).toBe(
      true,
    );
    expect(sourcePolicyCurrent(revision("reddit_thread", now), now)).toBe(
      false,
    );
  },
);

it.each(["GITHUB_SOURCES_ENABLED", "REDDIT_SOURCES_ENABLED"])(
  "requires explicit provider activation at %s without inheriting the other provider",
  (flag) => {
    policy();
    vi.stubEnv(flag, "");
    expect(
      sourcePolicyCurrent(
        revision(
          flag === "GITHUB_SOURCES_ENABLED"
            ? "github_repository"
            : "reddit_thread",
        ),
      ),
    ).toBe(false);
    expect(
      sourcePolicyCurrent(
        revision(
          flag === "GITHUB_SOURCES_ENABLED"
            ? "reddit_thread"
            : "github_repository",
        ),
      ),
    ).toBe(true);
  },
);

it.each([
  ["DIRECT_SOURCES_ENABLED", "false"],
  ["RESTORE_LOCK", "true"],
  ["DISABLE_CAPTURE", "true"],
])("keeps %s as a kill switch for both direct providers", (flag, value) => {
  policy();
  vi.stubEnv(flag, value);
  expect(sourcePolicyCurrent(revision("github_repository"))).toBe(false);
  expect(sourcePolicyCurrent(revision("reddit_thread"))).toBe(false);
});

it("checks Reddit policy identity, workloads and deadline using the supplied current time", () => {
  const now = Date.now(),
    eligibility = policy(now),
    source = revision("reddit_thread", now);
  expect(sourcePolicyCurrent(source, now)).toBe(true);
  for (const changed of [
    { ...eligibility, evidenceId: "different-policy" },
    { ...eligibility, workloads: ["selected_thread_read", "private_summary"] },
    { ...eligibility, expiresAt: now + 1000 },
  ]) {
    vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", JSON.stringify(changed));
    expect(sourcePolicyCurrent(source, now + 1000)).toBe(false);
  }
});

it("preserves supplied evidence with providers closed while still denying expired retention", () => {
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
  vi.stubEnv("GITHUB_SOURCES_ENABLED", "false");
  vi.stubEnv("REDDIT_SOURCES_ENABLED", "false");
  const source = revision("supplied_text");
  expect(sourcePolicyCurrent(source)).toBe(true);
  expect(
    sourcePolicyCurrent({
      ...source,
      retention: {
        retainUntil: Date.now() - 1,
        deletionWithinMs: 1000,
        policyEvidenceId: "old",
      },
    }),
  ).toBe(false);
});
