import Link from "next/link";
import { backend, api } from "@/lib/backend";
import { SignOutButton } from "@/components/sign-out-button";
import { AppTheme } from "@/components/app-theme";
import { Header } from "@/components/header";
import { ActionForm } from "@/components/action-form";
import { deleteAccount, logout } from "@/app/actions";
import { Card, Input, Label, Button } from "@companynerve/ui";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  const c = await backend();
  const [data, invoiceAccess] = await Promise.all([
    c.query(api.accounts.current, {}),
    c.query(api.invoiceOperations.status, {}),
  ]);
  return (
    <div className="container account-page">
      <AppTheme />
      <Header />
      <main id="main" className="doc">
        <h1>Your account</h1>
        <div className="stack">
          <Card>
            <h2 style={{ marginTop: 0 }}>Workspaces</h2>
            <Button variant="outline" asChild>
              <Link prefetch={false} href="/app/workspaces">
                Switch or manage your workspaces
              </Link>
            </Button>
          </Card>
          {invoiceAccess.allowed && (
            <Card>
              <h2 style={{ marginTop: 0 }}>Invoice operations</h2>
              <p>
                Review reporting deadlines and record the accountant's
                submission reference.
              </p>
              <Button variant="outline" asChild>
                <Link href="/account/invoices" prefetch={false}>
                  Open private invoice queue
                </Link>
              </Button>
            </Card>
          )}
          <Card>
            <h2 style={{ marginTop: 0 }}>{data.user.name}</h2>
            <p className="muted">{data.user.email}</p>
            <form action={logout}>
              <SignOutButton />
            </form>
          </Card>
          <Card>
            <h2 style={{ marginTop: 0 }}>Your data</h2>
            <p className="muted">
              Download your profile and organization memberships.
            </p>
            <Button variant="outline" asChild>
              <Link href="/account/export" prefetch={false}>
                Download account data
              </Link>
            </Button>
          </Card>
          <Card>
            <h2 style={{ marginTop: 0 }}>Delete your account</h2>
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
          </Card>
        </div>
      </main>
    </div>
  );
}
