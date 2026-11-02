"use server";
import {
  onboardingInviteCookie,
  invitationPath,
} from "../../../../packages/onboarding/invitation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backend, api } from "@/lib/backend";
import {
  onboardingCookie,
  onboardingSecret,
  signedOnboardingDraft,
} from "@/lib/onboarding-server";
import {
  onboardingDraft,
  signOnboardingValue,
} from "../../../../packages/onboarding/journey";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { FormState } from "@/components/action-form";
import { revalidatePath } from "next/cache";
import { startV1Checkout } from "@/app/actions";
export async function beginOnboarding(value: unknown) {
  const draft = onboardingDraft.parse(value);
  const jar = await cookies();
  jar.set(
    onboardingCookie,
    await signOnboardingValue(draft, onboardingSecret()),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 86400,
    },
  );
  redirect("/sign-up?onboarding=1");
}
export async function startOnboardingCheckout(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const interval = String(form.get("interval"));
  if (!["monthly", "annual", "weekly"].includes(interval))
    return { error: "Choose an available Pro plan." };
  await (
    await backend()
  ).mutation(api.onboarding.selectPlan, {
    interval: interval as "monthly" | "annual" | "weekly",
  });
  return startV1Checkout(state, form);
}
export async function saveAuthenticatedOnboarding(value: unknown) {
  await (
    await backend()
  ).mutation(api.onboarding.save, { draft: onboardingDraft.parse(value) });
  redirect("/onboarding/resume");
}
export async function chooseOnboardingProject(form: FormData) {
  const id = String(form.get("repositoryId") ?? "");
  await (
    await backend()
  ).mutation(api.onboarding.chooseProject, {
    organizationId: String(form.get("organizationId")) as Id<"organizations">,
    ...(id ? { repositoryId: Number(id) } : {}),
  });
  redirect("/onboarding/resume");
}
export async function finishOnboarding() {
  const client = await backend();
  const state = await client.query(api.onboarding.status, {});
  if (state.legacy) redirect("/app");
  if (!state.paid) redirect("/onboarding/resume");
  const organizationId = await client.mutation(
    api.organizations.createPrivate,
    {},
  );
  let sourceId = state.progress?.sourceId;
  if (!sourceId && state.progress?.selectedFamilyId) {
    const { starterClient } = await import("@/lib/onboarding-server");
    const available = await starterClient().query(api.onboardingStarter.list, {
      interests: state.progress.interests,
    });
    const selected = available.find(
      (item) => item.familyId === state.progress?.selectedFamilyId,
    );
    if (selected)
      sourceId = await client.mutation(api.product.capture, {
        organizationId,
        key: `onboarding-v1:${selected.familyId}`,
        kind: "url",
        url: selected.canonical,
        title: selected.title.slice(0, 160),
        rightsAttested: true,
      });
  }
  await client.mutation(api.onboarding.complete, sourceId ? { sourceId } : {});
  const jar = await cookies();
  jar.delete(onboardingCookie);
  const invitation = invitationPath(jar.get(onboardingInviteCookie)?.value);
  if (invitation) redirect(invitation);
  redirect(`/app/${organizationId}`);
}
export async function prepareFirstProject(): Promise<FormState> {
  const client = await backend(),
    status = await client.query(api.onboarding.status, {});
  const selected = status.progress?.repository;
  if (!status.paid || !selected)
    return { error: "Choose Pro and a connected project first." };
  try {
    const organizationId = await client.mutation(
      api.organizations.createPrivate,
      {},
    );
    await client.action(api.integrations.connectRepository, {
      organizationId,
      installationId: selected.installationId,
      providerId: selected.id,
      fullName: selected.fullName,
    });
    revalidatePath("/onboarding/project");
    return { message: "Project prepared. Continue with your project context." };
  } catch {
    return {
      error:
        "Project preparation wasn't confirmed. Review its status in Projects before retrying.",
      link: "/app",
    };
  }
}
export async function confirmFirstProject(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const client = await backend(),
    status = await client.query(api.onboarding.status, {});
  if (!status.paid || !status.progress?.repository)
    return { error: "Choose Pro and a connected project first." };
  try {
    const organizationId = await client.mutation(
      api.organizations.createPrivate,
      {},
    );
    const repositories = await client.query(api.product.repositories, {
      organizationId,
    });
    const repository = repositories.find(
      (repo) =>
        repo.providerId === status.progress?.repository?.id &&
        repo.enabled &&
        repo.status === "connected",
    );
    if (!repository) return { error: "Prepare the current repository first." };
    const profile = String(form.get("profile") ?? "").trim();
    await client.mutation(api.profiles.saveDraft, {
      id: repository._id,
      sha: repository.sha,
      version: repository.profileVersion,
      selectionVersion: repository.selectionVersion,
      previousDraft: repository.profileDraft ?? "",
      profile,
    });
    await client.mutation(api.profiles.confirmDraft, {
      id: repository._id,
      sha: repository.sha,
      version: repository.profileVersion,
      selectionVersion: repository.selectionVersion,
      profile,
    });
    revalidatePath("/onboarding/project");
    return { message: "Project context confirmed." };
  } catch {
    return {
      error:
        "The project changed. Reload and review its current context before confirming.",
    };
  }
}
export async function disconnectOnboardingGitHub(form: FormData) {
  await (
    await backend()
  ).mutation(api.jobs.revoke, {
    organizationId: String(form.get("organizationId")) as Id<"organizations">,
    provider: "github",
  });
  redirect("/onboarding/resume?edit=github");
}
export async function refreshOnboardingRepositories(): Promise<FormState> {
  const client = await backend();
  const organizationId = await client.mutation(
    api.organizations.createPrivate,
    {},
  );
  try {
    await client.action(api.githubOAuth.refreshChoices, { organizationId });
    revalidatePath("/onboarding/resume");
    return { message: "Repository access refreshed." };
  } catch {
    return {
      error: "GitHub access couldn't be refreshed. Reconnect or skip for now.",
    };
  }
}
export async function adoptOnboardingDraft() {
  const draft = await signedOnboardingDraft();
  if (draft) await (await backend()).mutation(api.onboarding.save, { draft });
}

export async function saveFirstOwnLink(): Promise<FormState> {
  const client = await backend();
  const status = await client.query(api.onboarding.status, {});
  if (!status.paid || !status.progress?.pendingUrl)
    return { error: "Choose Pro and a public video link first." };
  const { safeSourceUrl } =
    await import("../../../../packages/media/acquisition-policy.mjs");
  const { createHash } = await import("node:crypto");
  const url = safeSourceUrl(status.progress.pendingUrl);
  const organizationId = await client.mutation(
    api.organizations.createPrivate,
    {},
  );
  const sourceId = await client.mutation(api.product.capture, {
    organizationId,
    key: `onboarding-own-v1:${createHash("sha256").update(url).digest("hex").slice(0, 32)}`,
    kind: "url",
    url,
    title: "Saved video",
    rightsAttested: true,
  });
  redirect(`/app/${organizationId}/posts/${sourceId}`);
}
