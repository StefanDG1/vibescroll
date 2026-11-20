import Link from "next/link";
import { backend, api } from "@/lib/backend";
import { Database, Download, SlidersHorizontal } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ActionForm } from "@/components/action-form";
import {
  renameOrganization,
  deleteOrganization,
  setCatalogBrowsing,
} from "@/app/actions";
import { Input, Label, Button } from "@companynerve/ui";
import {
  AccountPageFrame,
  AccountSection,
  AccountStatus,
} from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
export default async function Page({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const organizationId = org as Id<"organizations">;
  const [local, client] = await Promise.all([
    localSnapshotRequest(),
    backend(),
  ]);
  const [info, catalog] = await Promise.all([
    client.query(api.organizations.details, { organizationId }),
    local
      ? Promise.resolve(null)
      : client.query(api.catalogAccess.status, { organizationId }),
  ]);
  return (
    <AccountPageFrame
      title="Workspace settings"
      back={{ href: `/app/${org}/account`, label: "Account" }}
    >
      <div className="account-grid account-grid-start">
        <AccountSection
          title="Workspace name"
          icon={SlidersHorizontal}
          trailing={
            <AccountStatus>
              {info.private ? "Private library" : "Team workspace"}
            </AccountStatus>
          }
        >
          {local || !["owner", "admin"].includes(info.role) ? (
            <p>{info.name}</p>
          ) : (
            <ActionForm action={renameOrganization}>
              <input type="hidden" name="organizationId" value={org} />
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={info.name}
                required
                maxLength={80}
              />
            </ActionForm>
          )}
        </AccountSection>
        <AccountSection
          title="Shared library"
          description="Pro reuses available analysis for the posts you save. Browsing the full shared library is a separate add-on."
          icon={Database}
        >
          {catalog?.entitled ? (
            <ActionForm action={setCatalogBrowsing} label="Save preference">
              <Label htmlFor="catalog-enabled" className="checkbox-label">
                <input
                  id="catalog-enabled"
                  name="enabled"
                  type="checkbox"
                  defaultChecked={catalog.enabled}
                />
                <span>Browse the full shared library</span>
              </Label>
              {catalog.enabled && catalog.available && (
                <Link prefetch={false} href={`/app/${org}/catalog`}>
                  Open shared library
                </Link>
              )}
            </ActionForm>
          ) : (
            <p className="muted">
              {catalog
                ? "Full-library browsing is unavailable for this account."
                : "Shared library preferences are unavailable."}
            </p>
          )}
        </AccountSection>
      </div>
      {info.role === "owner" && !local && (
        <>
          <AccountSection
            title="Workspace export"
            description="Download the workspace name and projects as JSON."
            icon={Download}
          >
            <Button variant="outline" asChild>
              <a href={`/app/${org}/export`}>Download workspace data</a>
            </Button>
          </AccountSection>
          <details className="account-disclosure" data-tone="danger">
            <summary>Delete this workspace</summary>
            <p className="muted">
              Cancel any subscription first. This removes projects, memberships,
              invitations, and local billing/audit records. Provider financial
              records follow the provider's retention policy.
            </p>
            <ActionForm
              action={deleteOrganization}
              label="Delete workspace"
              danger
            >
              <input type="hidden" name="organizationId" value={org} />
              <Label htmlFor="confirmation">Type {info.name} to confirm</Label>
              <Input id="confirmation" name="confirmation" required />
            </ActionForm>
          </details>
        </>
      )}
    </AccountPageFrame>
  );
}
