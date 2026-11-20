import Link from "next/link";
import { Download, ReceiptText, Users } from "lucide-react";
import { backend, api } from "@/lib/backend";
import { SignOutButton } from "@/components/sign-out-button";
import { ActionForm } from "@/components/action-form";
import { AccountPageFrame, AccountSection } from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { deleteAccount, logout } from "@/app/actions";
import { Input, Label, Button } from "@companynerve/ui";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ workspace?: string }>;
}) {
  const local = await localSnapshotRequest();
  const c = await backend();
  const [data, invoiceAccess] = await Promise.all([
    c.query(api.accounts.current, {}),
    local
      ? Promise.resolve({ allowed: false })
      : c.query(api.invoiceOperations.status, {}),
  ]);
  const requestedWorkspace = (await searchParams)?.workspace;
  const workspace =
    data.organizations.find((item) => item.id === requestedWorkspace) ??
    data.organizations[0];
  const name = local ? "Your account" : data.user.name || "Your account";
  return (
    <AccountPageFrame
      title="Profile"
      back={
        workspace && { href: `/app/${workspace.id}/account`, label: "Account" }
      }
    >
      <section className="account-identity">
        <div className="account-identity-main">
          <span className="account-initial" aria-hidden="true">
            {name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h2>{name}</h2>
            {(data.user.email || workspace?.name) && (
              <p>{data.user.email || workspace?.name}</p>
            )}
          </div>
        </div>
        {!local && (
          <form action={logout}>
            <SignOutButton />
          </form>
        )}
      </section>
      <div className="account-grid">
        <AccountSection title="Workspaces" icon={Users}>
          <Button variant="outline" asChild>
            <Link
              prefetch={false}
              href={
                workspace
                  ? `/app/workspaces?from=${workspace.id}`
                  : "/app/workspaces"
              }
            >
              Manage workspaces
            </Link>
          </Button>
        </AccountSection>
        <AccountSection
          title="Your data"
          icon={Download}
          description="Download your profile and workspace memberships."
        >
          {!local ? (
            <Button variant="outline" asChild>
              <Link href="/account/export" prefetch={false}>
                Download account data
              </Link>
            </Button>
          ) : (
            <p>Account export is unavailable.</p>
          )}
        </AccountSection>
      </div>
      {invoiceAccess.allowed && (
        <AccountSection
          title="Invoice operations"
          icon={ReceiptText}
          description="Review reporting deadlines and submission references."
        >
          <Button variant="outline" asChild>
            <Link href="/account/invoices" prefetch={false}>
              Open invoice queue
            </Link>
          </Button>
        </AccountSection>
      )}
      {!local && (
        <details className="account-disclosure" data-tone="danger">
          <summary>Delete your account</summary>
          <p className="muted">
            Transfer ownership or delete any workspace where you are the last
            owner. Your access is locked immediately, then your identity is
            deleted. Organization-owned content remains with its organization.
          </p>
          <ActionForm action={deleteAccount} label="Delete account" danger>
            <Label htmlFor="confirmation">
              Type {data.user.email} to confirm
            </Label>
            <Input
              id="confirmation"
              name="confirmation"
              required
              autoComplete="off"
            />
          </ActionForm>
        </details>
      )}
    </AccountPageFrame>
  );
}
