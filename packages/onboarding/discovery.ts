import { onboardingInterests, type OnboardingDraft } from "./journey";

export function matchesStarter(
  post: { title: string; authorName: string | null; interests: string[] },
  query: string,
) {
  const words = query
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const text = [
    post.title,
    post.authorName ?? "",
    ...post.interests.flatMap((id) => {
      const interest = onboardingInterests.find((item) => item.id === id);
      return interest
        ? [id.replaceAll("_", " "), interest.label, interest.description]
        : [id];
    }),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Old answers win; a newly selected post provides setup defaults, not a quiz. */
export function discoveryDraft(
  draft: Partial<OnboardingDraft>,
  categories: string[] = [],
): OnboardingDraft {
  const interests = onboardingInterests
    .filter((item) => categories.includes(item.id))
    .map((item) => item.id)
    .slice(0, 3);
  return {
    ...draft,
    version: 1,
    goal: draft.goal ?? "find_ideas",
    interests: draft.interests?.length
      ? draft.interests
      : interests.length
        ? interests
        : ["coding"],
  };
}
