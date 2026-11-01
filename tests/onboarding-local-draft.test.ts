import { it, expect } from "vitest";
import {
  onboardingLocalState,
  onboardingDraft,
} from "../packages/onboarding/journey";
it("retains incomplete choices and the Continue step without treating them as signup authority", () => {
  const saved = {
    draft: { version: 1, interests: ["coding"] },
    step: "interests",
  };
  expect(onboardingLocalState.parse(JSON.parse(JSON.stringify(saved)))).toEqual(
    saved,
  );
  expect(onboardingDraft.safeParse(saved.draft).success).toBe(false);
  expect(
    onboardingLocalState.safeParse({ ...saved, step: "reader" }).success,
  ).toBe(false);
  expect(
    onboardingLocalState.safeParse({
      ...saved,
      draft: { ...saved.draft, password: "never" },
    }).success,
  ).toBe(false);
});

it("allows only exact local invitation returns, never an arbitrary redirect", async () => {
  const { invitationPath } = await import("../packages/onboarding/invitation");
  const { authenticationReturnTo } =
    await import("../packages/policy/reauthentication");
  const path = "/join/" + "a".repeat(64);
  expect(invitationPath("a".repeat(64))).toBe(path);
  expect(authenticationReturnTo(path)).toBe(path);
  for (const value of [
    path + "?next=https://evil.test",
    path + "/extra",
    "//evil.test/",
    path + "\n",
  ])
    expect(authenticationReturnTo(value)).toBe("/app");
});

it("keeps telemetry to milestones and omits answers, links and provider state", async () => {
  const { safeAnalyticsEvent } =
    await import("../apps/starter/lib/analytics-events");
  expect(
    safeAnalyticsEvent("onboarding_result_viewed", {
      route: "cached",
      url: "https://private.example",
      customTopic: "private",
    }),
  ).toEqual({
    event: "onboarding_result_viewed",
    properties: { schema_version: "1", route: "cached" },
  });
  expect(
    safeAnalyticsEvent("onboarding_milestone", {
      milestone: "pro_verified",
      token: "never",
    }),
  ).toEqual({
    event: "onboarding_milestone",
    properties: { schema_version: "1", milestone: "pro_verified" },
  });
});
