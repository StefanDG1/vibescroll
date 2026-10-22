import Link from "next/link";
import { configured } from "@/lib/backend";
export default function Page() {
  return (
    <main className="narrow" id="main">
      <h1>
        {configured()
          ? "Application settings are present."
          : "Connect your application."}
      </h1>
      <p>
        Environment settings do not verify provider configuration. Complete
        sign-in with an email one-time code and with Google to check your setup.
      </p>
      <ol>
        <li>Run the Convex development setup from the repository root.</li>
        <li>
          Create this product&apos;s own WorkOS environment. Register
          <code> http://localhost:3001/callback</code> and the sign-in URL
          <code> http://localhost:3001/sign-in</code>.
        </li>
        <li>
          Enable Magic Auth email codes and Google OAuth in WorkOS. Disable
          email/password and other sign-in methods.
        </li>
        <li>
          Configure Google with this product&apos;s own OAuth client. Store its
          secret in WorkOS. Do not reuse CompanyNerve or another product&apos;s
          credentials.
        </li>
        <li>
          Run <code>node scripts/setup-local.mjs</code> to prepare the starter
          environment.
        </li>
        <li>Restart the starter development server.</li>
      </ol>
      <p>
        See docs/local-development.md for the exact steps and environment
        variables.
      </p>
      <Link prefetch={false} href="/sign-in">
        Continue to sign in
      </Link>
    </main>
  );
}
