import {
  onboardingDraft,
  onboardingLocalState,
  type OnboardingDraft,
  type OnboardingStep,
} from "./journey";

export const quizSteps = ["goal", "interests", "work", "obstacle"] as const;
export const goalChoices = [
  {
    id: "build_faster",
    label: "Build something new",
    description: "Turn an idea into a starting point",
    icon: "code",
  },
  {
    id: "improve_product",
    label: "Improve my product",
    description: "Find useful changes for what I am building",
    icon: "palette",
  },
  {
    id: "grow_business",
    label: "Grow my business",
    description: "Put practical growth ideas to work",
    icon: "chart",
  },
  {
    id: "find_ideas",
    label: "Learn and explore",
    description: "Keep useful ideas within reach",
    icon: "compass",
  },
] as const;
export const workChoices = [
  {
    id: "existing",
    label: "An existing project",
    description: "Bring useful ideas to my current work",
    icon: "folder",
  },
  {
    id: "new",
    label: "A new idea",
    description: "Find a useful place to begin",
    icon: "lightbulb",
  },
  {
    id: "team",
    label: "A project with my team",
    description: "Find ideas we can use together",
    icon: "users",
  },
  {
    id: "exploring",
    label: "Just exploring",
    description: "I do not need a project yet",
    icon: "compass",
  },
] as const;
export const obstacleChoices = [
  {
    id: "lost",
    label: "I lose useful links",
    description: "Find the right post again",
    icon: "search",
  },
  {
    id: "forgotten",
    label: "I forget the useful advice",
    description: "Keep the takeaway, not just the post",
    icon: "book",
  },
  {
    id: "apply",
    label: "I struggle to apply it",
    description: "Connect an idea to a practical next step",
    icon: "workflow",
  },
  {
    id: "overload",
    label: "I find more ideas than I can use",
    description: "Start with what matters to my work",
    icon: "layers",
  },
  {
    id: "unsure",
    label: "Not sure yet",
    description: "Show me how it works",
    icon: "compass",
  },
] as const;

export function restoreOnboarding(raw: string) {
  try {
    const value = JSON.parse(raw || "null");
    const local = onboardingLocalState.safeParse(value);
    if (local.success) return local.data;
    const old = onboardingDraft.safeParse(value);
    if (old.success)
      return { draft: old.data, step: "summary" as const, history: [] };
  } catch {
    /* An invalid local draft never grants access. */
  }
  return undefined;
}

export function quizReady(
  step: OnboardingStep,
  draft: Partial<OnboardingDraft>,
) {
  if (step === "goal") return !!draft.goal;
  if (step === "interests")
    return !!draft.interests?.length || !!draft.customTopic?.trim();
  if (step === "work") return !!draft.workStage;
  if (step === "obstacle") return !!draft.obstacle;
  return true;
}

export function firstMissingQuestion(
  draft: Partial<OnboardingDraft>,
): OnboardingStep | undefined {
  return quizSteps.find((step) => !quizReady(step, draft));
}

export function onboardingHint(draft: Partial<OnboardingDraft>) {
  if (draft.obstacle === "apply")
    return "See how a useful idea becomes a plan for your project.";
  if (draft.obstacle === "lost")
    return "Keep posts and their takeaways together, so you can find them again.";
  if (draft.obstacle === "overload")
    return "Start with a relevant post and one useful next step.";
  return "Keep the useful idea, then come back when you need it.";
}

export function rankOnboardingPosts<T extends { interests: string[] }>(
  posts: T[],
  draft: Partial<OnboardingDraft>,
) {
  const goalTopics =
    draft.goal === "grow_business"
      ? ["marketing", "business_operations"]
      : draft.goal === "improve_product"
        ? ["product_design", "coding"]
        : draft.goal === "build_faster"
          ? ["coding", "ai"]
          : [];
  const score = (post: T) =>
    post.interests.filter((topic) =>
      draft.interests?.includes(topic as OnboardingDraft["interests"][number]),
    ).length *
      4 +
    post.interests.filter((topic) => goalTopics.includes(topic)).length;
  return posts
    .map((post, index) => ({ post, index, score: score(post) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.post);
}
