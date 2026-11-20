import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { triageDependencyAudit } from "../scripts/audit-policy.mjs";

it("allows only the exact unexpired mitigation and keeps the registry finding visible", () => {
  const bytes = Buffer.from("owned synthetic patch");
  const row = {
    github_advisory_id: "GHSA-owned-0001",
    module_name: "owned",
    severity: "high",
    findings: [{ version: "1.0.0" }],
  };
  const audit = {
    advisories: { one: row },
    metadata: { vulnerabilities: { high: 1, critical: 0 } },
  };
  const mitigation = {
    advisory: row.github_advisory_id,
    module: row.module_name,
    version: "1.0.0",
    status: "local_mitigation",
    patch: "patches/owned.patch",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    recheckBy: "2026-11-02T00:00:00Z",
  };
  const now = Date.parse("2026-10-03T00:00:00Z");
  expect(
    triageDependencyAudit(audit, [mitigation], () => bytes, now),
  ).toMatchObject({
    passed: true,
    registryCounts: { high: 1 },
    locallyMitigated: [{ advisory: row.github_advisory_id }],
  });
  const twoVersions = {
    ...audit,
    advisories: { one: {
      ...row,
      findings: [...row.findings, { version: "2.0.0" }],
    } },
  };
  expect(triageDependencyAudit(twoVersions, [mitigation], () => bytes, now).passed)
    .toBe(false);
  expect(triageDependencyAudit(
    twoVersions,
    [mitigation, { ...mitigation, version: "2.0.0" }],
    () => bytes,
    now,
  ).passed).toBe(true);
  expect(
    triageDependencyAudit(
      audit,
      [mitigation],
      () => Buffer.from("changed"),
      now,
    ).passed,
  ).toBe(false);
  expect(
    triageDependencyAudit(
      audit,
      [mitigation],
      () => bytes,
      Date.parse(mitigation.recheckBy),
    ).passed,
  ).toBe(false);
  expect(
    triageDependencyAudit(
      {
        ...audit,
        advisories: { one: { ...row, github_advisory_id: "GHSA-new-0002" } },
      },
      [mitigation],
      () => bytes,
      now,
    ).passed,
  ).toBe(false);
  expect(() =>
    triageDependencyAudit(
      { ...audit, metadata: { vulnerabilities: { high: 0, critical: 0 } } },
      [mitigation],
      () => bytes,
      now,
    ),
  ).toThrow("counts");
});
