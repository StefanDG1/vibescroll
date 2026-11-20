import Link from "next/link";
import { configured } from "@/lib/backend";
import { PublicIntro, PublicPage } from "@/components/site";
export default function Page() {
  return (
    <PublicPage layout="reader">
      <PublicIntro
        title={
          configured()
            ? "Check your application setup"
            : "Connect your application"
        }
      >
        <p>
          Set up Convex and WorkOS, then verify email-code and Google sign-in.
        </p>
      </PublicIntro>
      <ol className="public-setup-steps">
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
      <div className="public-actions">
        <a
          href="https://github.com/StefanDG1/vibescroll/blob/main/docs/local-development.md"
          className="primary"
        >
          Read the local setup guide
        </a>
        {configured() && (
          <Link className="secondary" prefetch={false} href="/sign-in">
            Verify sign-in
          </Link>
        )}
      </div>
    </PublicPage>
  );
}
