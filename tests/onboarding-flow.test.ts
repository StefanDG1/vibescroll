import { expect, it } from "vitest";
import {
  firstMissingQuestion,
  onboardingHint,
  quizReady,
  restoreOnboarding,
} from "../packages/onboarding/flow";
import {
  onboardingDraft,
  onboardingLocalState,
} from "../packages/onboarding/journey";
import { discoveryDraft } from "../packages/onboarding/discovery";

it("restores partial answers and the actual visited branch without losing a pending source", () => {
  const local = {
    draft: {
      version: 1,
      interests: ["ai"],
      goal: "find_ideas",
      pendingUrl: "https://www.instagram.com/reel/AbCdEfG1234/",
      workStage: "existing",
      projectDescription: "My product",
      obstacle: "apply",
    },
    step: "import",
    history: [
      "welcome",
      "goal",
      "interests",
      "work",
      "obstacle",
      "summary",
      "feed",
      "import_benefit",
    ],
  };
  expect(restoreOnboarding(JSON.stringify(local))).toEqual(local);
  expect(
    firstMissingQuestion(onboardingDraft.parse(local.draft)),
  ).toBeUndefined();
  expect(onboardingDraft.parse(local.draft).projectDescription).toBe(
    "My product",
  );
});
it("keeps old answers but asks only the newly missing questions", () => {
  const old = {
    version: 1,
    interests: ["marketing"],
    goal: "grow_business",
    importRequested: true,
  };
  const restored = restoreOnboarding(JSON.stringify(old));
  expect(restored?.draft).toEqual(old);
  expect(restored?.step).toBe("summary");
  expect(firstMissingQuestion(restored!.draft)).toBe("work");
  expect(restoreOnboarding("invalid")).toBeUndefined();
});
it("allows exploration without falsely assigning a development interest", () => {
  const value = onboardingDraft.parse({
    version: 1,
    goal: "find_ideas",
    interests: [],
    customTopic: "Exploring",
    workStage: "exploring",
    obstacle: "unsure",
  });
  expect(quizReady("interests", value)).toBe(true);
  expect(discoveryDraft(value, ["coding"]).interests).toEqual([]);
  expect(firstMissingQuestion({ version: 1, interests: [] })).toBe("goal");
});
it("answers change practical guidance and never enter telemetry as arbitrary fields", () => {
  expect(onboardingHint({ obstacle: "apply" })).toContain("plan");
  expect(onboardingHint({ obstacle: "lost" })).toContain("find");
  expect(onboardingHint({ obstacle: "overload" })).toContain("one useful");
  expect(
    onboardingLocalState.safeParse({
      draft: { version: 1, token: "no" },
      step: "welcome",
    }).success,
  ).toBe(false);
  expect(
    onboardingLocalState.safeParse({ draft: { version: 1 }, step: "reader" })
      .success,
  ).toBe(false);
});

it("uses the goal as a topic tie-breaker without overriding explicit interests or reordering ties", async () => {
  const { rankOnboardingPosts } = await import("../packages/onboarding/flow");
  const posts = [
    { name: "Code", interests: ["coding"] },
    { name: "Growth", interests: ["marketing"] },
    { name: "Other growth", interests: ["marketing"] },
  ];
  expect(
    rankOnboardingPosts(posts, { goal: "grow_business" }).map((p) => p.name),
  ).toEqual(["Growth", "Other growth", "Code"]);
  expect(
    rankOnboardingPosts(posts, {
      goal: "grow_business",
      interests: ["coding"],
    })[0].name,
  ).toBe("Code");
});
