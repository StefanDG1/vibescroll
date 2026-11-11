import { backend, api } from "@/lib/backend";
import { ActionForm } from "@/components/action-form";
import { redirect } from "next/navigation";
import { acceptInvite, skipPendingInvitation } from "@/app/actions";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await backend();
  const status = await client.query(api.onboarding.status, {});
  if (!status.legacy && (!status.paid || status.progress?.stage !== "complete"))
    redirect("/onboarding/resume");
  const data = await client.query(api.accounts.current, {});
  return (
    <main id="main" className="narrow">
      <h1>Join your team.</h1>
      <p>
        You are signed in as {data.user.email}. The invitation must be addressed
        to this email.
      </p>
      <ActionForm action={acceptInvite} label="Accept invitation">
        <input type="hidden" name="token" value={token} />
      </ActionForm>
      <form action={skipPendingInvitation}>
        <button className="muted">Not now</button>
      </form>
    </main>
  );
}
