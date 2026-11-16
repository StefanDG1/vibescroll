import { BriefcaseBusiness, LockKeyhole, Plus } from "lucide-react";
import { backend, api } from "@/lib/backend";
import { ActionForm } from "@/components/action-form";
import {
  AccountLink,
  AccountPageFrame,
  AccountSection,
} from "@/components/account-layout";
import { createOrganization, createPrivateLibrary } from "@/app/actions";
import { Input, Label } from "@companynerve/ui";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { publicContinuation } from "@/lib/public-knowledge-display";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    draft?: string;
    publicEdition?: string;
    publicVersion?: string;
    from?: string;
  }>;
}) {
  const query = await searchParams;
  const continuation = publicContinuation(query);
  const fields = new URLSearchParams(continuation);
  const data = await (await backend()).query(api.accounts.current, {});
  const local = await localSnapshotRequest();
  const workspace =
    data.organizations.find((item) => item.id === query.from) ??
    data.organizations[0];
  return (
    <AccountPageFrame
      title="Workspaces"
      back={
        workspace
          ? { href: `/app/${workspace.id}/account`, label: "Account" }
          : { href: "/account", label: "Profile" }
      }
    >
      <AccountSection title="Choose a workspace">
        {data.organizations.length ? (
          <div className="account-link-list">
            {data.organizations.map((item) => (
              <AccountLink
                key={item.id}
                icon={item.private ? LockKeyhole : BriefcaseBusiness}
                title={item.name}
                description={
                  item.private
                    ? "Private library · Only you"
                    : `Team workspace · ${item.role}`
                }
                href={
                  `/app?workspace=${item.id}` +
                  (continuation ? `&${continuation}` : "")
                }
              />
            ))}
          </div>
        ) : (
          <p>Join with an invitation link or create a workspace below.</p>
        )}
      </AccountSection>
      {!local && (
        <div className="account-grid">
          <AccountSection
            title="Private library"
            description="Keep your saved posts accessible only to you."
            icon={LockKeyhole}
          >
            <ActionForm
              action={createPrivateLibrary}
              label="Open my private library"
            >
              {[...fields].map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
            </ActionForm>
          </AccountSection>
          <AccountSection
            title="Create a team workspace"
            icon={Plus}
            description="Workspace members can read its library according to their role."
          >
            <ActionForm action={createOrganization} label="Create workspace">
              {[...fields].map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <div>
                <Label htmlFor="name">Workspace name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Your company"
                />
              </div>
            </ActionForm>
          </AccountSection>
        </div>
      )}
    </AccountPageFrame>
  );
}
