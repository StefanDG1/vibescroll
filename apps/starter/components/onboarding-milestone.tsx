"use client";
import {
  useAnalyticsView,
  trackCheckoutReturn,
  analyticsReadyEvent,
} from "@/lib/analytics";
import { useEffect } from "react";
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
  useAnalyticsView("onboarding_milestone", { milestone });
  return null;
}

export function OnboardingStageView({
  step,
}: {
  step: "assistant" | "github" | "paywall" | "ready";
}) {
  useAnalyticsView("onboarding_step_viewed", { step });
  return null;
}
export function CheckoutReturnMeasurement({
  completed,
}: {
  completed: boolean;
}) {
  useEffect(() => {
    const check = () => trackCheckoutReturn(completed);
    if (check()) return;
    window.addEventListener(analyticsReadyEvent, check);
    return () => window.removeEventListener(analyticsReadyEvent, check);
  }, [completed]);
  return null;
}
