import { backend, api } from "@/lib/backend";
import { ActionForm } from "@/components/action-form";
import { redirect } from "next/navigation";
import { acceptInvite, skipPendingInvitation } from "@/app/actions";
import { PublicIntro, PublicPage } from "@/components/site";
import { invitationPath } from "../../../../../packages/onboarding/invitation";
import Link from "next/link";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!invitationPath(token))
    return (
      <PublicPage layout="form">
        <PublicIntro title="This invitation link is invalid">
          <p>Ask the person who invited you for a new link.</p>
        </PublicIntro>
        <Link className="primary" href="/app" prefetch={false}>
          Open VibeScroll
        </Link>
      </PublicPage>
    );
  const client = await backend();
  const status = await client.query(api.onboarding.status, {});
  if (!status.legacy && (!status.paid || status.progress?.stage !== "complete"))
    redirect("/onboarding/resume");
  const data = await client.query(api.accounts.current, {});
  return (
    <PublicPage layout="form">
      <PublicIntro title="Join your team">
        <p>Accept an invitation addressed to {data.user.email}.</p>
      </PublicIntro>
      <div className="public-actions">
        <ActionForm action={acceptInvite} label="Accept invitation">
          <input type="hidden" name="token" value={token} />
        </ActionForm>
        <form action={skipPendingInvitation}>
          <button className="secondary">Not now</button>
        </form>
      </div>
    </PublicPage>
  );
}
