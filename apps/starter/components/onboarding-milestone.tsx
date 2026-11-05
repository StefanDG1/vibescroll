"use client";
import { useEffect } from "react";
import { track } from "@/lib/analytics";
export type OnboardingMilestoneName =
  | "account_ready"
  | "github_connected"
  | "paywall_viewed"
  | "pro_verified"
  | "workspace_ready"
  | "proposal_saved";
export function OnboardingMilestone({
  milestone,
}: {
  milestone: OnboardingMilestoneName;
}) {
  useEffect(() => {
    try {
      const key = `vibescroll.onboarding.milestone.${milestone}`;
      if (sessionStorage.getItem(key)) return;
      track("onboarding_milestone", { milestone });
      sessionStorage.setItem(key, "1");
    } catch {
      /* Optional telemetry cannot block setup. */
    }
  }, [milestone]);
  return null;
}
