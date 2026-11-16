import { cookies } from "next/headers";
import {
  onboardingInviteCookie,
  invitationPath,
} from "../../../../packages/onboarding/invitation";
import { redirect } from "next/navigation";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../convex/_generated/dataModel";
import { publicContinuation } from "@/lib/public-knowledge-display";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    draft?: string;
    workspace?: string;
    view?: string;
    tier?: string;
    publicEdition?: string;
    publicVersion?: string;
  }>;
}) {
  const query = await searchParams;
  const continuation = publicContinuation(query);
  if (
    process.env.VIBESCROLL_LOCAL_SNAPSHOT === "1" &&
    (await localSnapshotRequest())
  ) {
    const { readLocalSnapshot } = await import("@/lib/local-snapshot");
    const { organizationId } = await readLocalSnapshot();
    if (query.view === "billing") redirect(`/app/${organizationId}/billing?tier=pro`);
    redirect(`/app/${organizationId}${continuation ? `?${continuation}` : ""}`);
  }
  const client = await backend();
  const onboarding = await client.query(api.onboarding.status, {});
  if (
    !onboarding.legacy &&
    (!onboarding.paid || onboarding.progress?.stage !== "complete")
  )
    redirect("/onboarding/resume");
  if (query.view === "billing") {
    const personal = await client.mutation(api.organizations.createPrivate, {});
    redirect(`/app/${personal}/billing?tier=pro`);
  }
  const invitation = invitationPath(
    (await cookies()).get(onboardingInviteCookie)?.value,
  );
  if (invitation) redirect(invitation);
  const id = await client.mutation(
    api.organizations.ensureDefault,
    query.workspace
      ? { preferredId: query.workspace as Id<"organizations"> }
      : {},
  );
  if (!id) redirect(`/app/workspaces${continuation ? `?${continuation}` : ""}`);
  redirect(`/app/${id}${continuation ? `?${continuation}` : ""}`);
}
