import type { SkillRecommendation } from "./project-builder-journey";

// Reviewed instructions, publisher and per-skill license at these exact commits.
// Selection runs locally. Private goals/repository text never leave this app.
const verifiedAt = Date.UTC(2026, 9, 23);
const vercel = "063bee94c3f4df8453406c830b0a7df0f2860278";
const openai = "49f948faa9258a0c61caceaf225e179651397431";
const entries: readonly (SkillRecommendation & { terms: RegExp })[] = [
  {
    id: "vercel-react-best-practices",
    name: "React best practices",
    publisher: "Vercel",
    sourceUrl: `https://github.com/vercel-labs/agent-skills/blob/${vercel}/skills/react-best-practices/SKILL.md`,
    purpose:
      "Review React and Next.js rendering, data fetching and bundle costs.",
    fitReason: "Your stated context includes a React or Next.js application.",
    destination: "codex",
    verifiedAt,
    license: "MIT",
    installed: "unknown",
    terms: /\b(react|next\.?js|nextjs)\b/i,
  },
  {
    id: "vercel-composition-patterns",
    name: "React composition patterns",
    publisher: "Vercel",
    sourceUrl: `https://github.com/vercel-labs/agent-skills/blob/${vercel}/skills/composition-patterns/SKILL.md`,
    purpose:
      "Design reusable React components and review component state ownership.",
    fitReason: "Your stated context includes React components.",
    destination: "codex",
    verifiedAt,
    license: "MIT",
    installed: "unknown",
    terms: /\b(react|next\.?js|nextjs)\b/i,
  },
  {
    id: "openai-playwright",
    name: "Playwright browser checks",
    publisher: "OpenAI",
    sourceUrl: `https://github.com/openai/skills/blob/${openai}/skills/.curated/playwright/SKILL.md`,
    purpose:
      "Check real browser journeys and capture evidence while building a web app.",
    fitReason:
      "Your stated context includes a web application or browser testing.",
    destination: "codex",
    verifiedAt,
    license: "Apache-2.0",
    installed: "unknown",
    terms:
      /\b(web|browser|website|react|next\.?js|nextjs|frontend|playwright)\b/i,
  },
];

export function recommendProjectSkills(context: readonly string[]) {
  const text = context
    .slice(0, 20)
    .map((item) => item.slice(0, 2000))
    .join(" ");
  const recommendations = entries
    .filter((entry) => entry.terms.test(text))
    .slice(0, 3)
    .map(({ terms: _terms, ...entry }) => entry);
  return {
    status: !text.trim()
      ? ("needs_context" as const)
      : recommendations.length
        ? ("ready" as const)
        : ("unavailable" as const),
    recommendations,
    explanation:
      recommendations.length < 3
        ? "Only recommendations whose reviewed instructions match your stated context are shown. Installation is optional; installed status is unknown."
        : "Review each skill's instructions and permissions in Codex before installing. Installation is optional; installed status is unknown.",
  };
}
