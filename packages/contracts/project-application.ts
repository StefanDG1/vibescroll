import { z } from "zod";

export const projectApplicationContextInput = z.strictObject({
  profileId: z.string().min(1).max(100).optional(),
  sourceId: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100),
  analysisVersionId: z.string().min(1).max(100).optional(),
  insightIds: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
});

const categoryTerms: Record<string, string[]> = {
  coding: [
    "code",
    "coding",
    "software",
    "typescript",
    "javascript",
    "python",
    "testing",
  ],
  ai: ["ai", "llm", "inference", "model", "assistant"],
  video_editing: ["video", "editing", "ffmpeg"],
  sales: ["sales", "selling", "crm"],
  business_operations: ["operations", "workflow", "process"],
  marketing: ["marketing", "campaign", "seo", "advertising"],
  product_design: ["design", "interface", "usability", "ux"],
};

/** Term overlap is a discovery hint, never a suitability or quality verdict. */
export function projectCategoryMatches(categories: string[], profile: string) {
  const words = new Set(profile.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return [...new Set(categories)].flatMap((category) => {
    const matchedTerms = (categoryTerms[category] ?? []).filter((term) =>
      words.has(term),
    );
    return matchedTerms.length ? [{ category, matchedTerms }] : [];
  });
}
