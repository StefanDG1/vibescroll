import { backend, api } from "@/lib/backend";
import { LockKeyhole, MailPlus, Users } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ActionForm } from "@/components/action-form";
import { inviteMember, changeMember, revokeInvite } from "@/app/actions";
import { Input, Label, Select, Button } from "@companynerve/ui";
import Link from "next/link";
import { PrivateLibraryUpgrade } from "@/components/private-library-upgrade";
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
  const c = await backend(),
    organizationId = org as Id<"organizations">;
  const info = await c.query(api.organizations.details, { organizationId });
  const back = { href: `/app/${org}/account`, label: "Account" };
  if (info.private)
    return (
      <AccountPageFrame title="Team" back={back}>
        <AccountSection
          title="Private library"
          description="Only you can access this library. Use a team workspace when you want to work with others."
          icon={LockKeyhole}
        >
          <Button variant="outline" asChild>
            <Link prefetch={false} href="/app/workspaces">
              Browse workspaces
            </Link>
          </Button>
        </AccountSection>
      </AccountPageFrame>
    );
  const canManage = ["owner", "admin"].includes(info.role);
  if (!canManage || (await localSnapshotRequest()))
    return (
      <AccountPageFrame title="Team" description={info.name} back={back}>
        <AccountSection
          title="Members and invitations"
          description={
            canManage
              ? "Membership details are unavailable."
              : "Ask a workspace owner or admin to manage membership and invitations."
          }
          icon={Users}
          trailing={<AccountStatus>{info.role}</AccountStatus>}
        >
          <Button variant="outline" asChild>
            <Link prefetch={false} href={`/app/workspaces?from=${org}`}>
              Browse workspaces
            </Link>
          </Button>
        </AccountSection>
      </AccountPageFrame>
    );
  const [members, invitations] = await Promise.all([
    c.query(api.organizations.members, { organizationId }),
    c.query(api.organizations.invitations, { organizationId }),
  ]);
  return (
    <AccountPageFrame title="Team" description={info.name} back={back}>
      <AccountSection
        title="Members"
        icon={Users}
        trailing={
          <AccountStatus>
            {members.length} {members.length === 1 ? "member" : "members"}
          </AccountStatus>
        }
      >
        <ul className="account-record-list account-members">
          {members.map((m) => (
            <li key={m.id}>
              <div className="account-member-copy">
                <strong>{m.name}</strong>
                {m.email && <span className="muted">{m.email}</span>}
                <AccountStatus>{m.role}</AccountStatus>
              </div>
              {info.role === "owner" && (
                <details className="account-inline-disclosure">
                  <summary>
                    Change access <span className="sr-only">for {m.name}</span>
                  </summary>
                  <ActionForm action={changeMember} label="Save role">
                    <input type="hidden" name="organizationId" value={org} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <label className="sr-only" htmlFor={m.id}>
                      Role for {m.name}
                    </label>
                    <Select id={m.id} name="role" defaultValue={m.role}>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                      <option value="remove">Remove access</option>
                    </Select>
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
        </ul>
        <p className="fine">
          Viewers can read workspace records. Members can capture and review
          content. Admins can manage projects and invite members. Owners also
          manage billing and team roles.
        </p>
      </AccountSection>
      <AccountSection
        title="Invite someone"
        description="Create a private invitation link. The recipient signs in with the verified address below."
        icon={MailPlus}
      >
        <ActionForm action={inviteMember} label="Create invitation">
          <input type="hidden" name="organizationId" value={org} />
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
            />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role">
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              {info.role === "owner" && <option value="admin">Admin</option>}
            </Select>
          </div>
        </ActionForm>
      </AccountSection>
      {invitations.length > 0 && (
        <AccountSection title="Pending invitations">
          <ul className="account-record-list">
            {invitations.map((inv) => (
              <li key={inv.id}>
                <div>
                  {inv.email}
                  <div className="muted">
                    Expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString("en-GB", {
                      timeZone: "UTC",
                    })}
                  </div>
                </div>
                <ActionForm action={revokeInvite} label="Revoke" danger>
                  <input type="hidden" name="organizationId" value={org} />
                  <input type="hidden" name="invitationId" value={inv.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </AccountSection>
      )}
      {info.role === "owner" && <PrivateLibraryUpgrade organizationId={org} />}
    </AccountPageFrame>
  );
}
