import { projectCategoryMatches } from "../../../packages/contracts/project-application";

export type ProjectSuggestions = {
  versionId: string | null;
  items: { id: string; name: string; topics: string[]; fit: TopicFit }[];
};
export type TopicFit = {
  rubric: "topic-coverage-v1";
  matched: number;
  total: number;
  criteria: { category: string; matched: boolean; terms: string[] }[];
};
type Source = {
  categoryKeys?: string[];
  analysisVersion?: { id?: string };
  analysis?: {
    insights?: { title?: string; claim?: string; categories?: string[] }[];
  };
  summary?: string;
};
type Project = {
  _id: string;
  fullName: string;
  enabled: boolean;
  confirmed: boolean;
  status?: string;
  profile?: string;
};
const categories = [
  "coding",
  "ai",
  "video_editing",
  "sales",
  "business_operations",
  "marketing",
  "product_design",
];

// Sync timestamps are not user activity or priority. Do not invent those signals.
export function suggestProjects(
  source: Source,
  projects: Project[],
): ProjectSuggestions {
  const insights = source.analysis?.insights ?? [];
  const explicit = [
    ...new Set([
      ...(source.categoryKeys ?? []),
      ...insights.flatMap((i) => i.categories ?? []),
    ]),
  ];
  const topics = explicit.length
    ? explicit
    : projectCategoryMatches(
        categories,
        [
          source.summary ?? "",
          ...insights.map((i) => `${i.title ?? ""} ${i.claim ?? ""}`),
        ].join(" "),
      ).map((m) => m.category);
  const items = projects
    .filter((p) => p.enabled && p.confirmed && p.status === "connected")
    .map((p) => {
      const paragraphs = (p.profile ?? "").slice(0, 20000).split(/\n\s*\n/);
      const sections = paragraphs.filter((text) =>
        /^(purpose|audience|goals|features):/i.test(text.trim()),
      );
      const positiveContext = (
        sections.length ? sections : paragraphs.slice(0, 2)
      )
        .filter(
          (text) => !/^(non.?goals|constraints|evidence):/i.test(text.trim()),
        )
        .join(" ");
      const matched = projectCategoryMatches(topics, positiveContext);
      return {
        id: p._id,
        name: p.fullName,
        topics: matched.map((m) => m.category),
        fit: {
          rubric: "topic-coverage-v1" as const,
          matched: matched.length,
          total: topics.length,
          criteria: topics.map((category) => ({
            category,
            matched: matched.some((m) => m.category === category),
            terms:
              matched.find((m) => m.category === category)?.matchedTerms ?? [],
          })),
        },
        score: matched.length,
      };
    })
    .filter((p) => p.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
    .map(({ score: _score, ...p }) => p);
  return { versionId: source.analysisVersion?.id ?? null, items };
}
