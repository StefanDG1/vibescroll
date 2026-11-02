import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderGit2, Check, ArrowRight } from "lucide-react";
import { backend, api } from "@/lib/backend";
import { signedOnboardingDraft } from "@/lib/onboarding-server";
import { Onboarding, OnboardingShell } from "@/components/onboarding";
import { OnboardingMilestone } from "@/components/onboarding-milestone";
import { OnboardingPayment } from "@/components/onboarding-payment";
import { SearchChoices } from "@/components/search-choices";
import {
  chooseOnboardingProject,
  finishOnboarding,
  refreshOnboardingRepositories,
} from "../actions";
import { ActionForm } from "@/components/action-form";
import { logout } from "@/app/actions";
import styles from "@/components/onboarding.module.css";
export const metadata = {
  title: "Continue your setup",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ github?: string; checkout?: string; edit?: string }>;
}) {
  const query = await searchParams,
    client = await backend();
  let status = await client.query(api.onboarding.status, {});
  if (status.legacy) redirect("/app");
  if (status.progress?.stage === "complete" && status.paid) redirect("/app");
  if (status.progress?.stage === "quiz") {
    const draft = await signedOnboardingDraft();
    if (!draft) return <Onboarding authenticated />;
    try {
      await client.mutation(api.onboarding.save, { draft });
    } catch (error) {
      const value =
        error && typeof error === "object" && "data" in error
          ? String(error.data)
          : error instanceof Error
            ? error.message
            : "";
      if (!value.includes("SOURCE_UNAVAILABLE")) throw error;
      return (
        <Onboarding
          authenticated
          initialDraft={{ ...draft, selectedFamilyId: undefined }}
          notice="Your selected post is no longer available. Choose another ready post or continue with your own link. Your interests are kept."
        />
      );
    }
    status = await client.query(api.onboarding.status, {});
  }
  const organizationId = await client.mutation(
    api.organizations.createPrivate,
    {},
  );
  if (status.paid)
    return (
      <OnboardingShell step={3} authenticated>
        <OnboardingMilestone milestone="pro_verified" />
        <section className={styles.stage}>
          <span className={styles.status}>
            <Check size={20} /> Pro is ready
          </span>
          <h1>You're ready.</h1>
          <p className={styles.subtle}>
            Your selected post is waiting on Home.
          </p>
          <form action={finishOnboarding}>
            <button className={styles.primary}>
              Open Home <ArrowRight size={16} />
            </button>
          </form>
        </section>
      </OnboardingShell>
    );
  if (
    status.progress?.stage === "github" ||
    query.edit === "github" ||
    query.github === "connected" ||
    query.github === "failed"
  ) {
    // Offer GitHub once on first signup. Leaving it resumes at the paywall;
    // the OAuth return still opens the current repository choices.
    if (status.progress?.stage === "github")
      await client.mutation(api.onboarding.chooseProject, { organizationId });
    const choices = await client.query(api.githubLinks.choices, {
      organizationId,
    });
    return (
      <OnboardingShell step={3} authenticated>
        <OnboardingMilestone milestone="account_ready" />
        {query.github === "connected" && (
          <OnboardingMilestone milestone="github_connected" />
        )}
        <section className={styles.stage}>
          <FolderGit2 size={32} />

          <h1>Choose a project.</h1>
          <p className={styles.subtle}>
            Connect GitHub now. We'll keep the connection ready for your first
            project plan after Pro.
          </p>
          {query.github === "failed" && (
            <p role="alert">
              GitHub wasn't connected. Try again or skip for now. Your progress
              is saved.
            </p>
          )}
          {choices.length ? (
            <form action={chooseOnboardingProject}>
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <SearchChoices
                name="repositoryId"
                label="Find a repository"
                defaultValue={
                  status.progress?.repository?.id.toString() ??
                  String(choices[0].id)
                }
                options={choices
                  .slice(0, 200)
                  .map((repo) => ({ value: repo.id, label: repo.fullName }))}
              />
              <button className={styles.primary}>
                Continue <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <>
              {query.github === "connected" && (
                <div className={styles.notice}>
                  <p>
                    GitHub is connected. Give VibeScroll access to the
                    repositories you want to use.
                  </p>
                  <a
                    className={styles.primary}
                    href="https://github.com/apps/vibescroller/installations/new"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Choose repositories on GitHub
                  </a>
                  <ActionForm
                    action={refreshOnboardingRepositories}
                    label="I've granted repository access"
                  />
                </div>
              )}
              <Link
                className={styles.primary}
                href={`/api/github/connect?organizationId=${organizationId}&returnTo=onboarding`}
              >
                <FolderGit2 size={17} /> Connect GitHub
              </Link>
              <p className={styles.footnote}>
                Choose repositories you want VibeScroll to access. Connecting
                starts no analysis. Pro starts at €35/month.
              </p>
            </>
          )}
          <form action={chooseOnboardingProject}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <button className={styles.secondary}>Not now</button>
          </form>
        </section>
      </OnboardingShell>
    );
  }
  const catalogue = await client.query(api.commerce.catalogue, {});
  return (
    <OnboardingShell step={3} authenticated>
      <OnboardingMilestone milestone="account_ready" />
      <OnboardingMilestone milestone="paywall_viewed" />
      <section className={styles.stage}>
        <OnboardingPayment
          initialInterval={status.progress?.interval}
          organizationId={organizationId}
          countries={catalogue.countries}
          countryRequired={catalogue.billingCountryRequired}
          ready={
            catalogue.proOffer.configured &&
            (catalogue.sandboxEnabled || catalogue.liveEnabled)
          }
          returned={query.checkout === "complete"}
        />
        {status.progress?.repository && (
          <p className={styles.footnote}>
            <FolderGit2 size={14} /> {status.progress.repository.fullName} is
            selected.{" "}
            <Link href="/onboarding/resume?edit=github">Change project</Link>
          </p>
        )}
        <div className={styles.actions}>
          <Link href="/account" className={styles.secondary}>
            Account & connections
          </Link>
          <form action={logout}>
            <button className={styles.secondary}>Sign out</button>
          </form>
        </div>
      </section>
    </OnboardingShell>
  );
}
