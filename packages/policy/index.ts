import pricing from "../../contracts/pricing.json";
import { ConvexError } from "convex/values";
export { pricing };
export class PolicyError extends ConvexError<string> {
  constructor(
    public code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.message = `${code}: ${message}`;
    this.name = "PolicyError";
  }
}
export function ensure(ok: unknown, code: string, message: string): asserts ok {
  if (!ok) throw new PolicyError(code, message);
}
export function safeSourceUrl(raw: string) {
  const u = new URL(raw);
  ensure(
    u.protocol === "https:" && !u.username && !u.password && !u.port,
    "UNSUPPORTED_SOURCE",
    "Use an HTTPS source URL without credentials or a port.",
  );
  const hosts = [
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "instagram.com",
    "www.instagram.com",
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
    "vimeo.com",
    "www.vimeo.com",
  ];
  ensure(
    hosts.includes(u.hostname.toLowerCase()),
    "UNSUPPORTED_SOURCE",
    "This source requires a permitted upload or supplied transcript.",
  );
  // oxlint-disable-next-line unicorn/no-useless-spread -- Copy before deleting from this mutable iterator.
  for (const k of [...u.searchParams.keys()])
    if (k !== "v" && k !== "t") u.searchParams.delete(k);
  u.hash = "";
  return u.toString();
}
export function safePath(p: string) {
  return (
    p.length <= 300 &&
    !p.includes("\\") &&
    !p.startsWith("/") &&
    !p.includes(":") &&
    !p.split("/").some((s) => s === ".." || s === "." || !s) &&
    // oxlint-disable-next-line no-control-regex -- Reject control characters in repository paths.
    !/[\x00-\x1f]/.test(p)
  );
}
export function excludedPath(p: string) {
  return (
    !safePath(p) ||
    /(^|\/)(\.git|\.env(?:\..*)?|node_modules|dist|build|\.next|\.ssh|credentials|secrets|.*\.(pem|key|sqlite|db))($|\/)/i.test(
      p,
    )
  );
}
export function sensitivePath(p: string) {
  return /(^|\/)(\.github|infra|auth|billing|payments|identity|schema|migrations|security|convex|middleware|proxy)([./]|$)|(^|\/)(app\/api|packages\/providers)(\/|$)|(^|\/)(package\.json|.*lock.*)$/i.test(
    p,
  );
}
export function validatePaths(
  paths: string[],
  allowed: string[],
  highRisk = false,
) {
  ensure(
    paths.length > 0 && paths.length <= 100,
    "POLICY_BLOCKED",
    "Invalid changed-file count.",
  );
  for (const p of paths) {
    ensure(!excludedPath(p), "POLICY_BLOCKED", "Forbidden file path.");
    ensure(
      allowed.includes(p),
      "APPROVAL_STALE",
      "The change exceeds the approved files.",
    );
    ensure(
      highRisk || !sensitivePath(p),
      "POLICY_BLOCKED",
      "Sensitive changes require a high-risk review.",
    );
  }
}
export { containsSecret } from "./secrets.mjs";
export function prState(p: {
  state: string;
  draft?: boolean;
  merged_at?: string | null;
}) {
  return p.merged_at
    ? "merged"
    : p.state === "closed"
      ? "closed_unmerged"
      : p.draft
        ? "draft"
        : "open";
}
export function monthlyAnchor(start: number, index: number) {
  const d = new Date(start),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + index);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}
export type TaxConfig = {
  domestic: "pending_evidence" | "ro_small_business_exempt" | "ro_normal_vat";
  special317: boolean;
  evidence?: string;
  effectiveAt?: number;
  registrations: string[];
  countries: string[];
  oss: boolean;
  reviewed: boolean;
};
export function taxTreatment(
  c: TaxConfig,
  country: string,
  business: boolean,
  vatValid: boolean,
  live: boolean,
) {
  ensure(
    !live ||
      (c.domestic !== "pending_evidence" &&
        c.reviewed &&
        !!c.evidence &&
        !!c.effectiveAt &&
        c.effectiveAt <= Date.now()),
    "TAX_EVIDENCE_REQUIRED",
    "Live checkout needs matching official tax evidence.",
  );
  ensure(
    c.countries.includes(country),
    "COUNTRY_DISABLED",
    "Checkout is unavailable in this country.",
  );
  if (business && country !== "RO") {
    ensure(
      vatValid,
      "VAT_VALIDATION_REQUIRED",
      "Validate the business VAT identifier before reverse charge.",
    );
    return "reverse_charge";
  }
  if (country !== "RO") {
    ensure(
      c.oss && c.registrations.includes(country),
      "DESTINATION_TAX_REQUIRED",
      "Destination treatment needs an applicable registration.",
    );
    return "destination_vat";
  }
  return c.domestic === "ro_normal_vat"
    ? "domestic_vat"
    : c.domestic === "ro_small_business_exempt"
      ? "exempt_article_310"
      : "sandbox_pending_evidence";
}
export function invoiceDeadline(
  issue: number,
  holidays: string[],
  reviewed: boolean,
) {
  ensure(
    reviewed,
    "CALENDAR_REVIEW_REQUIRED",
    "Review the Romanian business-day calendar before setting a statutory deadline.",
  );
  const d = new Date(issue);
  let n = 0;
  while (n < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (
      d.getUTCDay() !== 0 &&
      d.getUTCDay() !== 6 &&
      !holidays.includes(d.toISOString().slice(0, 10))
    )
      n++;
  }
  return d.getTime();
}
export function turnoverAlerts(ron: number) {
  return [70, 85, 95].filter((p) => ron >= (395000 * p) / 100);
}
