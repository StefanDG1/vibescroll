import { Suspense } from "react";
import { notFound } from "next/navigation";
import { backend, api } from "@/lib/backend";
import { LaunchChecks } from "@/components/launch-checks";
import { AccountPageFrame, AccountSection } from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { ClipboardCheck } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default async function Page({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const info = await (
    await backend()
  ).query(api.organizations.details, {
    organizationId: org as Id<"organizations">,
  });
  if (info.role !== "owner" && info.role !== "admin") notFound();
  const local = await localSnapshotRequest();
  return (
    <AccountPageFrame
      title="Launch checks"
      description="Connect LaunchProof to view the test report for this workspace."
      back={{ href: `/app/${org}/connections`, label: "Connections" }}
    >
      {!local && (
        <Suspense
          fallback={<output>Checking LaunchProof connection…</output>}
        >
          <LaunchChecks organizationId={org} />
        </Suspense>
      )}
      <AccountSection title="Connect LaunchProof" icon={ClipboardCheck}>
        <ol className="account-steps">
          <li>
            <strong>Create a reporting application</strong>
            <p>
              Open{" "}
              <a href="https://launch.companynerve.com" rel="noreferrer">
                LaunchProof
              </a>{" "}
              and sign in separately. Create a reporting application in your own
              workspace.
            </p>
          </li>
          <li>
            <strong>Request a summary token</strong>
            <p>
              Ask that LaunchProof workspace owner to issue an application token
              with only <code>reports:read-summary</code>.
            </p>
          </li>
          <li>
            <strong>Send your mapping to the app operator</strong>
            <p>
              Give your application operator the reporting application ID and
              workspace slug. Explicitly map them to this organization ID:{" "}
              <code>{org}</code>, your target Convex origin, and the environment
              you test.
            </p>
          </li>
          <li>
            <strong>Enable the connection</strong>
            <p>
              The operator configures the server variables in{" "}
              <code>apps/starter/.env.example</code>, following{" "}
              <code>docs/operations/launchproof.md</code>. Store the summary
              token only in server secrets. Set{" "}
              <code>LP_INTEGRATION_ENABLED=true</code> and restart the app after
              reviewing the mapping.
            </p>
          </li>
          <li>
            <strong>Upload your report</strong>
            <p>
              Run approved checks locally or in your own CI and upload a
              sanitized report. Reload this page to read the summary. Only
              current owners and admins of the mapped organization can see it.
            </p>
          </li>
        </ol>
        <p>
          Keep target JWTs and test-user credentials in your local runner or CI
          secret store. Never enter them on the hosted LaunchProof website. The
          summary token cannot run checks or upload reports.
        </p>
        <p>
          Accounts remain separate. This connection does not link email
          addresses or share session cookies. Exported source contains no
          connection credentials.
        </p>
      </AccountSection>
      <details className="account-disclosure">
        <summary>Disconnect LaunchProof</summary>
        <ol>
          <li>
            Revoke the summary token in the owning LaunchProof application's
            token settings.
          </li>
          <li>
            Set <code>LP_INTEGRATION_ENABLED=false</code>, remove the server
            token and mapping variables, and restart every app and preview
            instance that received them.
          </li>
          <li>
            Reload the dashboard. The summary panel is absent when disabled.
            Existing projects, memberships, subscriptions, and retained
            LaunchProof reports are unchanged.
          </li>
        </ol>
        <p>
          This page does not save secrets or change server configuration. Your
          application operator performs the connection and disconnection.
        </p>
      </details>
    </AccountPageFrame>
  );
}
