"use client";

import { useRouter } from "next/navigation";
import { captureFirstOwnLink } from "@/app/onboarding/actions";
import { track } from "@/lib/analytics";
import { ActionForm } from "./action-form";

export function OnboardingOwnLink() {
  const router = useRouter();
  return (
    <ActionForm
      label="Save my link"
      pendingLabel="Saving your link…"
      action={async () => {
        try {
          const result = await captureFirstOwnLink();
          if (!result.postPath) return { error: result.error };
          track("source_captured", { kind: "url" });
          router.replace(result.postPath);
          return { message: "Opening your post…" };
        } catch {
          return { error: "Your link could not be saved yet. Try again." };
        }
      }}
    />
  );
}
