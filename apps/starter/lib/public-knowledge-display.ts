export type PublicInsight = {
  id: string;
  title: string;
  claim: string;
  interpretation: string;
  uncertainty: string[];
  citations: { label: string; url: string | null; kind: string }[];
};
export type PublicPayload = {
  title: string;
  summary: string;
  publisher: string;
  sourceUrl: string | null;
  sourceProvenance?: "supplied_text_unverified";
  coverage: string;
  language: string;
  pipelineVersion: string;
  schemaVersion: string;
  insights: PublicInsight[];
};
export type PublicEdition = PublicPayload & {
  slug: string;
  version: number;
  reuseAllowed: boolean;
  publishedDate: string | null;
  corrections?: { version: number; note: string }[];
};
export type PublicCollection = {
  slug: string;
  title: string;
  description: string;
  topic: string;
  editions: PublicEdition[];
};
export function publicSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{2,79}$/.test(value);
}
export function publicSaveHref(slug: string, version: number) {
  if (!publicSlug(slug) || !Number.isSafeInteger(version) || version < 1)
    return null;
  return `/app?${new URLSearchParams({ publicEdition: slug, publicVersion: String(version) })}`;
}
export function publicContinuation(input: {
  draft?: string;
  publicEdition?: string;
  publicVersion?: string;
}) {
  const params = new URLSearchParams();
  if (input.draft) params.set("draft", input.draft.slice(0, 2048));
  const version = Number(input.publicVersion);
  if (input.publicEdition && publicSaveHref(input.publicEdition, version)) {
    params.set("publicEdition", input.publicEdition);
    params.set("publicVersion", String(version));
  }
  return params.toString();
}
export function publicCitationUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
