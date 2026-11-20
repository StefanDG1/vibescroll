import { createHash } from "node:crypto";

export function triageDependencyAudit(
  audit,
  mitigations,
  readPatch,
  now = Date.now(),
) {
  if (
    !audit ||
    !audit.advisories ||
    typeof audit.advisories !== "object" ||
    !audit.metadata?.vulnerabilities ||
    !Array.isArray(mitigations)
  )
    throw Error("Invalid dependency audit or mitigation record");
  const relevant = Object.values(audit.advisories).filter((row) =>
    ["high", "critical"].includes(row.severity),
  );
  const mitigated = [],
    unresolved = [];
  for (const row of relevant) {
    const valid = row.findings?.length && row.findings.every(({ version }) =>
      mitigations.some((record) =>
        record.advisory === row.github_advisory_id &&
        record.module === row.module_name &&
        record.version === version &&
        record.status === "local_mitigation" &&
        Number.isFinite(Date.parse(record.recheckBy)) &&
        Date.parse(record.recheckBy) > now &&
        /^patches\/[A-Za-z0-9@._+-]+\.patch$/.test(record.patch) &&
        /^[a-f0-9]{64}$/.test(record.sha256) &&
        createHash("sha256").update(readPatch(record.patch)).digest("hex") === record.sha256,
      ),
    );
    (valid ? mitigated : unresolved).push({
      advisory: row.github_advisory_id,
      module: row.module_name,
      severity: row.severity,
    });
  }
  const reported = audit.metadata.vulnerabilities;
  if (
    !Number.isSafeInteger(reported.high) ||
    !Number.isSafeInteger(reported.critical) ||
    reported.high + reported.critical !== relevant.length
  )
    throw Error("Dependency audit counts do not reconcile");
  return {
    passed: unresolved.length === 0,
    registryCounts: reported,
    locallyMitigated: mitigated,
    unresolved,
  };
}
