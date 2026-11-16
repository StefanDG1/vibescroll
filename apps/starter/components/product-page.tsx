import { Console } from "./console";
import { workspaceData } from "@/lib/workspace-data";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { backend, api } from "@/lib/backend";
const onboardingStatus = cache(async () =>
  (await backend()).query(api.onboarding.status, {}),
);
export async function ProductPage({
  org,
  view,
  draft = "",
  search = "",
  filter = "",
  category = "",
  sort = "newest",
  sourceId,
  proposalId,
  compactHome = false,
  reviewDraftId,
  sharedSourceId,
  sharedGrantId,
  publicEdition,
  publicVersion,
}: {
  org: string;
  view: string;
  draft?: string;
  search?: string;
  filter?: string;
  category?: string;
  sort?: string;
  sourceId?: string;
  proposalId?: string;
  compactHome?: boolean;
  reviewDraftId?: string;
  sharedSourceId?: string;
  sharedGrantId?: string;
  publicEdition?: string;
  publicVersion?: number;
}) {
  const localSnapshot =
    process.env.VIBESCROLL_LOCAL_SNAPSHOT === "1" &&
    (await localSnapshotRequest());
  const auth = localSnapshot ? null : withAuth();
  if (!["account", "menu", "connections"].includes(view)) {
    const onboarding = await onboardingStatus();
    if (
      !onboarding.legacy &&
      (!onboarding.paid || onboarding.progress?.stage !== "complete")
    )
      redirect("/onboarding/resume");
  }
  const user = (await auth)?.user;
  const initial = await workspaceData({
    org,
    view: draft ? "full" : view,
    search,
    filter,
    category,
    sort,
    sourceId,
    proposalId,
    compactHome,
    sharedSourceId,
    sharedGrantId,
  });
  if (sourceId && !("selectedSource" in initial && initial.selectedSource))
    notFound();
  if (
    proposalId &&
    !("selectedProposal" in initial && initial.selectedProposal)
  )
    notFound();
  return (
    <Console
      localSnapshot={localSnapshot}
      profile={
        user
          ? {
              firstName: user.firstName,
              name: [user.firstName, user.lastName].filter(Boolean).join(" "),
              pictureUrl: user.profilePictureUrl,
            }
          : undefined
      }
      compactHomePreview={compactHome}
      initialReviewDraftId={reviewDraftId}
      key={`${org}:${sourceId ?? proposalId ?? "workspace"}`}
      initialSource={
        "selectedSource" in initial
          ? initial.selectedSource
          : "selectedProposal" in initial
            ? initial.selectedProposal
            : null
      }
      initialSharedDraft={draft.slice(0, 2048)}
      publicEdition={publicEdition}
      publicVersion={publicVersion}
      initialSearch={search}
      initialFilter={filter}
      initialCategory={category}
      initialSort={sort}
      organizationId={org}
      initialView={view}
      readOnly={initial.role === "viewer"}
      canRepairEvidence={initial.role === "owner"}
      canSuggestCategories={["owner", "admin"].includes(initial.role)}
      initial={initial}
    />
  );
}
