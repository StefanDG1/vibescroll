import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderGit2, Check } from "lucide-react";
import { backend, api } from "@/lib/backend";
import { OnboardingShell } from "@/components/onboarding";
import { OnboardingProposal } from "@/components/onboarding-proposal";
import { ActionForm } from "@/components/action-form";
import { prepareFirstProject, confirmFirstProject } from "../actions";
import styles from "@/components/onboarding.module.css";
export const metadata = {
  title: "Your first project plan",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const client = await backend(),
    status = await client.query(api.onboarding.status, {});
  if (status.legacy) redirect("/app");
  if (!status.paid || status.progress?.stage !== "complete")
    redirect("/onboarding/resume");
  const organizationId = await client.mutation(
    api.organizations.createPrivate,
    {},
  );
  const repositories = await client.query(api.product.repositories, {
    organizationId,
  });
  const selected = status.progress.repository;
  const repository = repositories.find(
    (repo) => selected?.id === repo.providerId && repo.enabled,
  );
  const source = status.progress.sourceId
    ? await client.query(api.product.detail, { id: status.progress.sourceId })
    : null;
  const insights = (source?.analysis?.insights ?? []).map(
    (insight: { id: string; title?: string; claim: string }) => ({
      ...insight,
      title: insight.title ?? "Saved insight",
    }),
  );
  return (
    <OnboardingShell step={3} authenticated>
      <section className={styles.stage}>
        <h1>Your first project plan.</h1>
        {source && (
          <p className={styles.subtle}>
            Use the insights from{" "}
            <Link href={`/app/${organizationId}/posts/${source._id}`}>
              {source.title}
            </Link>{" "}
            to improve your project.
          </p>
        )}
        {!selected ? (
          <>
            <p className={styles.subtle}>
              Choose a project when you're ready. Your post and its insights are
              saved.
            </p>
            <Link
              href={`/app/${organizationId}/projects`}
              className={styles.primary}
            >
              <FolderGit2 size={17} /> Choose a project
            </Link>
          </>
        ) : !repository || repository.status !== "ready" ? (
          <>
            <p className={styles.status}>
              <FolderGit2 size={18} /> {selected.fullName}
            </p>
            <p className={styles.subtle}>
              Prepare the repository so the plan can reference its actual code.
              This reads the selected repository; it does not change it or start
              an AI plan.
            </p>
            <ActionForm
              action={prepareFirstProject}
              label="Prepare my project"
            />
            <p className={styles.footnote}>
              Your GitHub connection is reused. If access changed, reconnect
              from Projects.
            </p>
          </>
        ) : !repository.confirmed ? (
          <>
            <p className={styles.status}>
              <Check size={18} /> {repository.fullName} is prepared
            </p>
            <p className={styles.subtle}>
              Add the context only you know. Who is this project for, and what
              would you like to improve?
            </p>
            <ActionForm
              action={confirmFirstProject}
              label="Confirm project context"
            >
              <label className={styles.field} htmlFor="first-project-context">
                Project context
                <textarea
                  id="first-project-context"
                  name="profile"
                  required
                  maxLength={7800}
                  rows={7}
                  defaultValue={
                    repository.profileDraft ?? repository.profile ?? ""
                  }
                  placeholder="What the project does, who uses it, and your current priorities"
                />
              </label>
            </ActionForm>
          </>
        ) : source?.analysisVersion?.id && insights.length > 0 ? (
          <>
            <p className={styles.status}>
              <Check size={18} /> {repository.fullName}
            </p>
            <p className={styles.subtle}>
              Create your proposal using all {insights.length} saved insights.
              The plan can then be generated with a credit quote, discussed and
              approved as a linked GitHub issue.
            </p>
            <OnboardingProposal
              goal={
                status.progress.goal === "grow_business"
                  ? "Explore how these insights could help grow this project's business."
                  : status.progress.goal === "build_faster"
                    ? "Explore how these insights could help build this project faster."
                    : status.progress.goal === "find_ideas"
                      ? "Explore a useful next idea for this project from the saved insights."
                      : "Explore how these insights could improve this product."
              }
              organizationId={organizationId}
              sourceId={source._id}
              analysisVersionId={source.analysisVersion.id}
              title={source.title}
              insights={insights}
              project={{ id: repository._id, name: repository.fullName }}
            />
          </>
        ) : (
          <>
            <p className={styles.subtle}>
              Save an analyzed post to create your first project plan.
            </p>
            <Link
              href={`/app/${organizationId}/posts`}
              className={styles.primary}
            >
              Open my posts
            </Link>
          </>
        )}
        {status.progress.team && (
          <p className={styles.footnote}>
            <Link href="/app/workspaces">
              Create or join your team's workspace
            </Link>
            . Each member uses their own Pro and credits.
          </p>
        )}
        {status.progress.importRequested && (
          <p className={styles.footnote}>
            Your import is waiting. In your workspace, open Save and choose
            Instagram export. Reselect your file to review and import the Saved
            links.
          </p>
        )}
        <p className={styles.footnote}>
          <Link href={`/app/${organizationId}`}>
            I'll explore my workspace first
          </Link>
        </p>
      </section>
    </OnboardingShell>
  );
}
