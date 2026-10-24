import { canonicalJson } from "../contracts/canonical-json.mjs";
import { socialHash } from "./contracts";
import { socialAnalysisOutput, type SocialAnalysis } from "./analysis";

export const serviceCatalogSearchVersion = "service-catalog-search-v1" as const;
export const serviceCatalogSearchMaxBytes = 8192;

export function serviceCatalogTopics(analysis: SocialAnalysis) {
  return {
    categories: [
      ...new Set(analysis.insights.flatMap((insight) => insight.categories)),
    ]
      .sort()
      .slice(0, 9),
    topics: [
      ...new Set(analysis.insights.flatMap((insight) => insight.topics ?? [])),
    ]
      .sort()
      .slice(0, 20),
  };
}

export async function serviceCatalogProjection(
  input: unknown,
  contentHash: string,
) {
  const analysis = socialAnalysisOutput.parse(input);
  if (!/^[a-f0-9]{64}$/.test(contentHash))
    throw Error("INVALID_CATALOG_CONTENT_HASH");
  const full = [
    analysis.summary,
    ...analysis.insights.flatMap((insight) => [
      insight.title,
      insight.claim,
      insight.interpretation,
      ...insight.categories,
      ...(insight.topics ?? []),
    ]),
  ]
    .map((text) => text.normalize("NFC").replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
  let text = "",
    bytes = 0;
  const encoder = new TextEncoder();
  for (const character of full) {
    const size = encoder.encode(character).length;
    if (bytes + size > serviceCatalogSearchMaxBytes) break;
    text += character;
    bytes += size;
  }
  return {
    catalogSearchVersion: serviceCatalogSearchVersion,
    catalogSearchText: text,
    catalogSearchHash: await socialHash(
      canonicalJson({
        version: serviceCatalogSearchVersion,
        contentHash,
        text,
      }),
    ),
  };
}
