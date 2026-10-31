import { projectCategoryMatches } from "./project-application";

export function projectTopicFit(topics: string[], profile: string) {
  const paragraphs = profile.slice(0, 20000).split(/\n\s*\n/);
  const sections = paragraphs.filter((text) =>
    /^(purpose|audience|goals|features):/i.test(text.trim()),
  );
  const positive = (sections.length ? sections : paragraphs.slice(0, 2))
    .filter((text) => !/^(non.?goals|constraints|evidence):/i.test(text.trim()))
    .join(" ");
  const matched = projectCategoryMatches(topics, positive);
  return {
    rubric: "topic-coverage-v1" as const,
    matched: matched.length,
    total: topics.length,
    criteria: topics.map((category) => ({
      category,
      matched: matched.some((m) => m.category === category),
      terms: matched.find((m) => m.category === category)?.matchedTerms ?? [],
    })),
  };
}

// Separate observed signals; none changes the displayed topic-fit fraction.
export function compareProjectRecommendations(
  a: {
    id: string;
    name: string;
    fit: { matched: number; total: number };
    priority: "low" | "normal" | "high";
    history: { relatedAccepted: number; lastPlanActivityAt: number | null };
  },
  b: typeof a,
) {
  const priority = { low: 0, normal: 1, high: 2 };
  return (
    b.fit.matched * a.fit.total - a.fit.matched * b.fit.total ||
    priority[b.priority] - priority[a.priority] ||
    b.history.relatedAccepted - a.history.relatedAccepted ||
    (b.history.lastPlanActivityAt ?? 0) - (a.history.lastPlanActivityAt ?? 0) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  );
}
