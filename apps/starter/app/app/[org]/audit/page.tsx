import { backend, api } from "@/lib/backend";
import { FileClock } from "lucide-react";
import {
  AccountPageFrame,
  AccountSection,
  AccountStatus,
} from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

export default async function Page({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const c = await backend();
  const organizationId = org as Id<"organizations">;
  const workspace = await c.query(api.organizations.details, {
    organizationId,
  });
  const canRead = ["owner", "admin"].includes(workspace.role);
  const rows =
    canRead && !(await localSnapshotRequest())
      ? await c.query(api.organizations.auditLog, { organizationId })
      : null;
  return (
    <AccountPageFrame
      title="Audit log"
      description={workspace.name}
      back={{ href: `/app/${org}/account`, label: "Account" }}
    >
      <AccountSection
        title="Recent workspace changes"
        description="Shows up to 50 actions, newest first."
        icon={FileClock}
        trailing={
          rows && (
            <AccountStatus>
              {rows.length} {rows.length === 1 ? "record" : "records"}
            </AccountStatus>
          )
        }
      >
        {rows?.length ? (
          <ul className="account-record-list">
            {rows.map((row) => (
              <li key={row._id}>
                <strong>{row.action.replaceAll(/[._]/g, " ")}</strong>
                <time dateTime={new Date(row.at).toISOString()}>
                  {date.format(row.at)} UTC
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {rows
              ? "No workspace changes recorded yet."
              : canRead
                ? "Audit activity is unavailable."
                : "Workspace owners and admins can view audit activity."}
          </p>
        )}
      </AccountSection>
    </AccountPageFrame>
  );
}
