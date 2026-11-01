import { getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { signedOnboardingDraft } from "@/lib/onboarding-server";
export async function GET() {
  if (process.env.ONBOARDING_ENABLED === "true") {
    if (!(await signedOnboardingDraft())) redirect("/onboarding");
    redirect(await getSignUpUrl({ returnTo: "/onboarding/resume" }));
  }
  redirect(await getSignUpUrl({ returnTo: "/app" }));
}
