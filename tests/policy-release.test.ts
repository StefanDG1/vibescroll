import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import archive from "../legal/archive/v1-2026-10-03.1/publication.json";
import { policyRelease } from "../packages/policy/publication";
import { proOffer } from "../packages/billing/pro-offer";
import { publicPolicyDocuments } from "../packages/policy/public-documents";

const read = (path: string) => readFileSync(resolve(path), "utf8");
it("preserves the complete previous published bundle and unchanged privacy documents", () => {
  for (const name of new Set(Object.values(publicPolicyDocuments))) {
    const file = `${name}.md`;
    const old = read(`legal/archive/${archive.release}/${file}`);
    expect(createHash("sha256").update(old).digest("hex")).toBe(
      archive.files[file as keyof typeof archive.files],
    );
  }
  for (const name of ["PRIVACY", "COOKIES", "DPA"]) {
    expect(read(`legal/${name}.md`)).toBe(
      read(`legal/archive/${archive.release}/${name}.md`),
    );
  }
});

it("publishes the approved offer and fair use without weakening the original refund window", () => {
  expect(policyRelease.id).toBe("v1-2026-11-01.1");
  const terms = read("legal/TERMS.md"),
    refunds = read("legal/REFUNDS.md");
  for (const interval of ["monthly", "annual", "weekly"] as const)
    expect(terms).toContain(`EUR ${proOffer[interval].amountCents / 100}`);
  expect(terms).toContain("300 credits");
  expect(terms).toContain("75 credits");
  expect(terms).toContain(
    "do not erase purchased credits or valid retained results",
  );
  expect(terms).toContain(
    "Every workspace member has their own Pro subscription and credits",
  );
  for (const name of ["TERMS", "REFUNDS", "ACCEPTABLE-USE"])
    expect(read(`legal/${name}.md`)).toContain(
      `Version: 1.1.0. Release: ${policyRelease.id}`,
    );
  const section = (s: string) =>
    s
      .replaceAll("\r\n", "\n")
      .split("## Initial refund policy\n\n")[1]
      .split("\n## Extra credits")[0];
  expect(section(refunds)).toBe(
    section(read(`legal/archive/${archive.release}/REFUNDS.md`)),
  );
});
