import Link from "next/link";
import { backend, api } from "@/lib/backend";
import { Header } from "@/components/header";
import { ActionForm } from "@/components/action-form";
import { createOrganization, createPrivateLibrary } from "@/app/actions";
import { Card, Input, Label, Badge } from "@companynerve/ui";
import { publicContinuation } from "@/lib/public-knowledge-display";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    draft?: string;
    publicEdition?: string;
    publicVersion?: string;
  }>;
}) {
  const query = await searchParams;
  const continuation = publicContinuation(query);
  const fields = new URLSearchParams(continuation);
  const data = await (await backend()).query(api.accounts.current, {});
  return (
    <div className="container">
      <Header />
      <main id="main" className="doc">
        <h1>Your workspaces</h1>
        <p className="muted">
          Welcome, {data.user.name}. Choose where you want to work.
        </p>
        <div className="project-grid">
          {data.organizations.map((o) => (
            <Link
              prefetch={false}
              href={
                `/app?workspace=${o.id}` +
                (continuation ? `&${continuation}` : "")
              }
              className="card project-link"
              key={o.id}
            >
              <h3>{o.name}</h3>
              <Badge>
                {o.private ? "Private library · only you" : "Team workspace"}
              </Badge>{" "}
              <Badge>{o.role}</Badge>
            </Link>
          ))}
        </div>
        {!data.organizations.length && (
          <p>
            You do not have a workspace yet. Create one below, or open an
            invitation link.
          </p>
        )}
        <Card style={{ marginTop: 32 }}>
          <h2 style={{ marginTop: 0 }}>Your private library</h2>
          <p>
            Only you can read this library. Use a separate workspace for a team.
            Existing workspace content stays where it is.
          </p>
          <ActionForm
            action={createPrivateLibrary}
            label="Open my private library"
          >
            {[...fields].map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          </ActionForm>
        </Card>
        <Card style={{ marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Create a team workspace</h2>
          <p>Workspace members can read its library according to their role.</p>
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
        </Card>
      </main>
    </div>
  );
}
