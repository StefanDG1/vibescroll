import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { cookies } from "next/headers";
import {
  onboardingDraft,
  readOnboardingValue,
} from "../../../packages/onboarding/journey";
export const onboardingCookie = "vibe-onboarding-draft";
export const previewCookie = "vibe-onboarding-preview";
export const onboardingSecret = () =>
  process.env.ONBOARDING_PREVIEW_SECRET ?? "";
export function starterClient() {
  if (
    !process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.ONBOARDING_ENABLED !== "true"
  )
    throw Error("Onboarding is unavailable.");
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL, {
    logger: false,
  });
}
export async function signedOnboardingDraft() {
  const token = (await cookies()).get(onboardingCookie)?.value;
  if (!token) return null;
  const value = await readOnboardingValue(token, onboardingSecret());
  const parsed = onboardingDraft.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export async function starterMetadata(interests: string[]) {
  try {
    return await starterClient().query(api.onboardingStarter.list, {
      interests,
    });
  } catch {
    return [];
  }
}
