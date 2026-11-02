import { expect, it } from "vitest";
import {
  discoveryDraft,
  matchesStarter,
} from "../packages/onboarding/discovery";
import { onboardingDraft } from "../packages/onboarding/journey";

const post = {
  title: "Atomic database updates",
  authorName: "minutelet",
  interests: ["coding", "ai"],
};
it("finds ready metadata by topic, creator and combined words without transcript retrieval", () => {
  for (const query of [
    "",
    " AI ",
    "MINUTELET",
    "database development",
    "build software",
  ])
    expect(matchesStarter(post, query)).toBe(true);
  for (const query of ["missing creator", "database marketing"])
    expect(matchesStarter(post, query)).toBe(false);
});
it("derives valid setup defaults from the chosen post and preserves earlier answers and destinations", () => {
  expect(
    onboardingDraft.parse(discoveryDraft({}, post.interests)),
  ).toMatchObject({ interests: ["coding", "ai"], goal: "find_ideas" });
  const earlier = {
    version: 1 as const,
    interests: ["marketing" as const],
    goal: "grow_business" as const,
    team: true,
    customTopic: "Education",
    importRequested: true,
    pendingUrl: "https://www.instagram.com/reel/AbCdEfG1234/",
  };
  expect(discoveryDraft(earlier, post.interests)).toEqual(earlier);
});
it("keeps own-link and no-selection setup valid without claiming an interest quiz was answered", () => {
  expect(
    onboardingDraft.parse(
      discoveryDraft({
        pendingUrl: "https://www.instagram.com/reel/AbCdEfG1234/",
      }),
    ).goal,
  ).toBe("find_ideas");
  expect(discoveryDraft({}, ["not-a-category"]).interests).toEqual(["coding"]);
});
