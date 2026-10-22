import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ActionForm } from "@/components/action-form";
import { inviteMember, changeMember, revokeInvite } from "@/app/actions";
import { Card, Input, Label, Select, Badge } from "@companynerve/ui";
import Link from "next/link";
export default async function Page({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const c = await backend(),
    organizationId = org as Id<"organizations">;
  const info = await c.query(api.organizations.details, { organizationId });
  if (info.private)
    return (
      <>
        <h1>Your private library</h1>
        <Card>
          <p>
            Only you can access this library. Invitations and ownership transfer
            are unavailable here.
          </p>
          <Link prefetch={false} href="/app/workspaces">
            Choose or create a team workspace
          </Link>
        </Card>
      </>
    );
  const [members, invitations] = await Promise.all([
    c.query(api.organizations.members, { organizationId }),
    c.query(api.organizations.invitations, { organizationId }),
  ]);
  return (
    <>
      <h1>Your team</h1>
      <div className="stack">
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  {info.role === "owner" && <th>Change access</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      <div className="muted">{m.email}</div>
                    </td>
                    <td>
                      <Badge>{m.role}</Badge>
                    </td>
                    {info.role === "owner" && (
                      <td aria-label={`Manage ${m.name}`}>
                        <ActionForm action={changeMember} label="Update">
                          <input
                            type="hidden"
                            name="organizationId"
                            value={org}
                          />
                          <input
                            type="hidden"
                            name="membershipId"
                            value={m.id}
                          />
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
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: ".8rem", marginTop: 20 }}>
            Viewers can read workspace records. Members can capture and review
            content. Admins can manage projects and invite members. Owners also
            manage billing and team roles.
          </p>
        </Card>
        <Card>
          <h2>Invite someone</h2>
          <p className="muted">
            Create a private link for a specific email address. The recipient
            needs to sign in with that verified address.
          </p>
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
        </Card>
        {invitations.length > 0 && (
          <Card>
            <h2>Pending invitations</h2>
            {invitations.map((inv) => (
              <div className="preview-row" key={inv.id}>
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
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
