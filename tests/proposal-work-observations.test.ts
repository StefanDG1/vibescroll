// @vitest-environment node
import { expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  githubWorkUrl,
  observationTime,
  proposalWorkView,
  type ProposalWorkHandoff,
} from "../apps/starter/lib/proposal-work-observations";
import { proposalTrail } from "../apps/starter/lib/proposal-trail";

const requireApp = createRequire(
  new URL("../apps/starter/package.json", import.meta.url),
);
const { createElement } = requireApp("react");
const { renderToStaticMarkup } = requireApp("react-dom/server");
const componentModule =
  "../apps/starter/components/proposal-work-observations.tsx";
const now = 1793534400000;
function handoff(): ProposalWorkHandoff {
  return {
    githubIssue: {
      provenance: "signed_github_webhook",
      issueId: 1,
      number: 42,
      url: "https://github.com/example/project/issues/42",
      state: "closed",
      providerUpdatedAt: now,
      observedAt: now,
      bodyMatchesFrozen: false,
      eventHash: "a".repeat(64),
    },
    githubPullRequests: [
      {
        provenance: "signed_github_webhook",
        pullRequestId: 2,
        number: 43,
        url: "https://github.com/example/project/pull/43",
        issueNumber: 42,
        headSha: "a".repeat(40),
        mergeCommitSha: "b".repeat(40),
        state: "merged",
        providerUpdatedAt: now,
        observedAt: now,
        eventHash: "c".repeat(64),
        checks: [
          {
            provenance: "signed_github_webhook",
            checkRunId: 99,
            appId: 7,
            headSha: "a".repeat(40),
            conclusion: "success",
            providerCompletedAt: now,
            observedAt: now,
            eventHash: "d".repeat(64),
          },
        ],
      },
    ],
    reports: [
      {
        provenance: "authenticated_model_report",
        key: "reported-work-one",
        hash: "e".repeat(64),
        actorId: "synthetic_actor",
        reportedAt: now,
        status: "completed",
        summary: "Reported change <script>untrusted()</script>",
        workUrls: [],
        commitSha: null,
      },
    ],
  };
}

it("renders signed PR/check facts separately from assistant claims in a closed native disclosure", async () => {
  const { ProposalWorkObservations } = await import(componentModule);
  const html = renderToStaticMarkup(
    createElement(ProposalWorkObservations, { handoff: handoff() }),
  );
  expect(html).toContain("<summary>Work updates</summary>");
  expect(html).not.toContain(" open=");
  expect(html).toContain("GitHub observed");
  expect(html).toContain('href="https://github.com/example/project/pull/43"');
  expect(html).toContain("PR #43");
  expect(html).toContain("Check #99");
  expect(html).toContain("success");
  expect(html).toContain("App 7");
  expect(html).toContain("aaaaaaaaaaaa");
  expect(html).toContain("Assistant reported");
  expect(html).toContain("completed");
  expect(html).toContain("&lt;script&gt;untrusted()&lt;/script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("Issue body changed from the approved handoff");
  expect(html).toContain(
    "Each check result covers its recorded run and commit",
  );
  expect(html).not.toMatch(/CI passed|all checks passed|verified completion/i);
});

it("bounds provider/report rendering and keeps unknown states explicit", async () => {
  const original = handoff();
  const pr = original.githubPullRequests![0];
  const oversized: ProposalWorkHandoff = {
    ...original,
    githubPullRequests: Array.from({ length: 20 }, (_, index) => ({
      ...pr,
      pullRequestId: index + 1,
      number: index + 1,
      state: "unknown",
      checks: Array.from({ length: 20 }, (_, checkIndex) => ({
        ...pr.checks[0],
        checkRunId: checkIndex + 1,
      })),
    })),
    reports: Array.from({ length: 20 }, (_, index) => ({
      ...original.reports[0],
      key: `report-${index}`,
    })),
  };
  const view = proposalWorkView(oversized);
  expect(view.pullRequests).toHaveLength(4);
  expect(view.pullRequests.every((item) => item.checks.length === 12)).toBe(
    true,
  );
  expect(view.reports).toHaveLength(8);
  expect(view.reports[0].key).toBe("report-12");
  const { ProposalWorkObservations } = await import(componentModule);
  const html = renderToStaticMarkup(
    createElement(ProposalWorkObservations, { handoff: oversized }),
  );
  expect(html.match(/state needs confirmation/g)).toHaveLength(4);
  expect(html.match(/Check #/g)).toHaveLength(48);
  expect(html.match(/Assistant reported/g)).toHaveLength(8);
  expect(
    renderToStaticMarkup(createElement(ProposalWorkObservations, {})),
  ).toBe("");
});

it("does not turn a completion report into an implementation run, PR or observed merge", () => {
  const reportOnly = { reports: handoff().reports };
  const stages = proposalTrail({ detail: { handoff: reportOnly } }, []);
  expect(stages[3]).toMatchObject({
    state: "pending",
    detail: "No linked run loaded",
  });
  expect(stages[4]).toMatchObject({ state: "pending", detail: "No PR loaded" });
  const observed = proposalTrail({ detail: { handoff: handoff() } }, []);
  expect(observed[4]).toMatchObject({ state: "recorded" });
  expect(observed[4].detail).toContain("GitHub merge observed");
  expect(observed[4].detail).toContain("benefit needs separate evidence");
});

it("allows only exact HTTPS GitHub issue/PR destinations and formats times without a locale hydration difference", () => {
  expect(
    githubWorkUrl("https://github.com/example/project/pull/43", "pull"),
  ).toBe("https://github.com/example/project/pull/43");
  for (const value of [
    "javascript:alert(1)",
    "https://github.com.evil.test/example/project/pull/43",
    "https://user:pass@github.com/example/project/pull/43",
    "https://github.com/example/project/pull/43?token=private",
    "https://github.com/example/project/issues/43",
    "https://github.com/example/project/pull/43#private",
  ])
    expect(githubWorkUrl(value, "pull")).toBeNull();
  expect(observationTime(now)).toBe("2026-11-01T12:00:00.000Z");
  expect(observationTime(Infinity)).toBeNull();
  expect(observationTime(9e15)).toBeNull();
});
