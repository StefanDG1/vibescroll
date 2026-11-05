import { vi } from "vitest";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { api, internal } from "../convex/_generated/api";
export const subject = "user_01234567890123456789012345";
export const clientId = "client_01234567890123456789012345";
export const scopes = [
  "knowledge:read",
  "context:read",
  "suggestions:draft",
  "analysis:request",
  "analysis:execute",
  "jobs:read",
  "feedback:write",
];
export async function fixture() {
  const f = await analysisVersionFixture(false);
  const enrolled = await f.owner.mutation(api.analysisVersions.enroll, {
    sourceId: f.sourceId,
  });
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Synthetic application", scopes }]),
  );
  const now = Date.now();
  const projectId = await f.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: f.org,
      installationId: 42,
      providerId: 55,
      fullName: "owned/synthetic",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "A software product with testing and an AI assistant.",
      profileVersion: 1,
      manifest: ["README.md"],
      status: "connected",
      context: "PRIVATE REPOSITORY CODE MUST STAY OUT",
      createdAt: now,
      updatedAt: now,
    }),
  );
  const grant = await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: f.grant.version,
    expiresAt: null,
    acknowledged: true,
    repositories: [
      {
        repositoryId: projectId,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        selectionVersion: 0,
      },
    ],
  });
  const identity = {
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  };
  const assistant = f.t.withIdentity(identity);
  const input = { sourceId: f.sourceId, projectId };
  return {
    ...f,
    assistant,
    identity,
    projectId,
    versionId: enrolled.versionId,
    grant,
    input,
    read: (args = input) =>
      assistant.query(internal.assistant.projectApplicationContext, args),
  };
}

export const body = {
  title: "Review a useful idea for this project",
  disposition: "needs_context" as const,
  currentProblem: "The project profile may benefit from this source idea.",
  proposedChange:
    "Inspect the current implementation before choosing a change.",
  benefitHypothesis:
    "This might improve the workflow, subject to verification.",
  risks: ["The project code has not been inspected."],
  nonGoals: ["No implementation starts here."],
  acceptanceCriteria: ["Verify the source claim against current project code."],
  verificationNeeds: ["Inspect the selected repository revision."],
};
export async function prepared() {
  const f = await fixture();
  const context = await f.read();
  const input = {
    ...f.input,
    analysisVersionId: f.versionId,
    insightIds: context.source.insights.map((i: any) => i.id),
    contextHash: context.contextHash,
    expectedVersion: 0,
    key: "create-chat-proposal-one",
    body,
  };
  return {
    ...f,
    context,
    input,
    save: (args = input) =>
      f.assistant.mutation(internal.assistantProposals.save, args),
  };
}
