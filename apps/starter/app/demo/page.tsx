import { Console } from "@/components/console";
import { libraryDemoSources } from "@/lib/library-demo";
import fixture from "../../../../fixtures/dashboard.json";
export const metadata = {
  title: "Labeled workflow demo",
  robots: { index: false, follow: false },
};
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{
    uiState?: string;
    view?: string;
    proposal?: string;
    source?: string;
  }>;
}) {
  const params = await searchParams;
  const state = params.uiState;
  const demoState =
    state === "loading" || state === "error" || state === "empty"
      ? state
      : "ready";
  const source =
    demoState === "ready"
      ? libraryDemoSources.find((s) => s._id === params.source)
      : undefined;
  return (
    <Console
      key={[demoState, params.view, source?._id, params.proposal].join(":")}
      demo
      readOnly
      initialReviewDraftId={params.proposal}
      initialSource={source}
      demoState={demoState}
      initialView={
        demoState !== "ready"
          ? "library"
          : source
            ? "source"
            : [
                  "library",
                  "trends",
                  "projects",
                  "proposals",
                  "runs",
                  "connections",
                  "account",
                ].includes(params.view ?? "")
              ? params.view
              : "home"
      }
      initialSearch={demoState === "empty" ? "Synthetic absent source" : ""}
      initial={{
        sources:
          demoState === "loading" || demoState === "empty"
            ? []
            : fixture.sources.map((source) => ({
                ...source,
                state: source.state ?? "ready",
              })),
        repositories:
          demoState === "ready"
            ? [
                {
                  _id: "synthetic-project",
                  providerId: 1,
                  installationId: 1,
                  fullName: "synthetic/demo-planner",
                  enabled: true,
                  confirmed: false,
                  sha: "a".repeat(40),
                  profileVersion: 1,
                  selectionVersion: 1,
                  status: "connected",
                  snapshotPaths: [],
                  profile:
                    "purpose: Synthetic planning app\n\naudience: Example members and administrators\n\nstage: Synthetic demo\n\ngoals: Review tasks\n\nbusinessModel: unknown\n\nconstraints: Synthetic data only\n\nnonGoals: No real execution\n\nroles: Members review tasks; administrators manage the demo workspace.\n\nfeatures: Synthetic task lists and review.\n\njourneys: Open a task, inspect it and choose a next action.\n\nfoundations: This is a labeled example, not customer research.\n\nevidence: Synthetic fixture only; no real repository was read.",
                  snapshotCoverage: {
                    wholeRepository: true,
                    includedFiles: 10,
                    indexedFiles: 10,
                    omittedFiles: 0,
                    inspectedFiles: 4,
                    wordDocuments: 0,
                    baseSha: "a".repeat(40),
                  },
                },
              ]
            : [],
        githubChoices:
          demoState === "ready"
            ? [{ id: 1, installationId: 1, fullName: "synthetic/demo-planner" }]
            : [],
        proposals:
          demoState === "ready"
            ? [
                {
                  _id: "synthetic-review",
                  sourceId: "src_demo_001",
                  repositoryId: "synthetic-project",
                  title: "Preview a useful result before setup",
                  review: "unreviewed",
                  disposition: "relevant",
                  version: 1,
                  baseSha: "a".repeat(40),
                  profileVersion: 1,
                  detail: {
                    currentProblem:
                      "The synthetic setup flow asks for configuration before showing a useful result.",
                    proposedChange:
                      "Show a labeled example first, then offer project setup when the person is ready.",
                    benefitHypothesis:
                      "An example may make the next decision easier to understand. This has not been measured.",
                    risks: [
                      "An example must not appear to be real saved data.",
                    ],
                    acceptanceCriteria: [
                      "Keep the example labeled synthetic.",
                      "Leave account and payment logic unchanged.",
                    ],
                    reason:
                      "Synthetic example only. Inspect the onboarding idea before deciding.",
                  },
                },
                {
                  _id: "synthetic-accepted",
                  sourceId: "src_demo_001",
                  repositoryId: "synthetic-project",
                  title: "Keep setup reversible",
                  review: "accepted",
                  disposition: "relevant",
                  version: 1,
                  baseSha: "a".repeat(40),
                  profileVersion: 1,
                  detail: {
                    reason:
                      "Synthetic review decision. Acceptance does not establish a benefit.",
                  },
                },
              ]
            : [],
        runs:
          demoState === "ready"
            ? [
                {
                  _id: "synthetic-run",
                  proposalId: "synthetic-accepted",
                  repositoryId: "synthetic-project",
                  state: "completed",
                },
              ]
            : [],
        notifications: [],
        usage: null,
      }}
      organizationId="demo"
    />
  );
}
