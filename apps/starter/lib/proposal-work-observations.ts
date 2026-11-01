import type { z } from "zod";
import type { proposalIssueHandoff } from "../../../packages/contracts/proposal-work";

export type ProposalWorkHandoff = Pick<
  z.infer<typeof proposalIssueHandoff>,
  "githubIssue" | "githubPullRequests" | "reports"
>;

export function githubWorkUrl(value: string, kind: "issues" | "pull") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      new RegExp(`^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/${kind}/[1-9][0-9]*$`).test(
        url.pathname,
      )
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Presentation bounds only. The authorized backend owns the signed binding and
// report provenance; rendering a record never grants execution or publication.
export function proposalWorkView(handoff?: ProposalWorkHandoff | null) {
  const issue =
    handoff?.githubIssue?.provenance === "signed_github_webhook"
      ? handoff.githubIssue
      : null;
  const pullRequests = (handoff?.githubPullRequests ?? [])
    .slice(0, 4)
    .filter((pr) => pr.provenance === "signed_github_webhook")
    .map((pr) => ({
      ...pr,
      checks: pr.checks
        .slice(0, 12)
        .filter((check) => check.provenance === "signed_github_webhook"),
    }));
  const reports = (handoff?.reports ?? [])
    .slice(-8)
    .filter((report) => report.provenance === "authenticated_model_report");
  return { issue, pullRequests, reports };
}

export function observationTime(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 8_640_000_000_000_000)
    return null;
  return new Date(value).toISOString();
}
