"use client";
import { ProjectProposalComposer } from "./project-proposal-composer";
import { useRouter } from "next/navigation";
export function OnboardingProposal({
  organizationId,
  sourceId,
  analysisVersionId,
  title,
  insights,
  project,
  goal,
}: {
  organizationId: string;
  sourceId: string;
  analysisVersionId: string;
  title: string;
  insights: { id: string; title: string; claim: string }[];
  project: { id: string; name: string };
  goal: string;
}) {
  const router = useRouter();
  async function call(operation: string, args: unknown) {
    const response = await fetch("/api/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, args }),
    });
    const value = await response.json();
    if (!response.ok)
      throw Object.assign(
        Error(value.error ?? "This action could not be completed."),
        {
          outcome: response.status < 500 ? "rejected" : "unknown",
          code: value.code,
        },
      );
    return value.result;
  }
  if (!insights.length) return null;
  return (
    <ProjectProposalComposer
      organizationId={organizationId}
      sourceId={sourceId}
      analysisVersionId={analysisVersionId}
      insight={insights[0]}
      insights={insights}
      sourceTitle={title}
      projects={[project]}
      suggestions={[{ ...project, topics: [] }]}
      disabled={false}
      call={call}
      initialGoal={goal}
      onSaved={(id) => router.push(`/app/${organizationId}/proposals/${id}`)}
    />
  );
}
