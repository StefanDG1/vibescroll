import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AccountPageFrame, AccountSection } from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { PublicModeration } from "@/components/public-moderation";

export default async function Page() {
  if (await localSnapshotRequest()) {
    return (
      <AccountPageFrame title="Public library moderation">
        <AccountSection
          title="Moderator access required"
          description="Authorized moderators can review reports and record decisions."
          icon={ShieldCheck}
        />
      </AccountPageFrame>
    );
  }
  const auth = await withAuth();
  if (!auth.user) redirect("/sign-in?returnTo=%2Fapp%2Fmoderation");
  return (
    <AccountPageFrame
      title="Public library moderation"
      description="Authorized moderators can read reports. Decisions require a recent sign-in."
    >
      <PublicModeration />
    </AccountPageFrame>
  );
}
