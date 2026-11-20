import { phrasePattern, searchTerms } from "./ranking";

const quotes = /"[^"\n]+"|“[^”\n]+”|https?:\/\/[^\s<>"”]+/gi;
const scaffolding = new Set(
  "saved example examples idea ideas want need way ways help adapt look lookups find useful related relevant sources second first separately whether people users should good better app tool kind how could improve".split(
    " ",
  ),
);
function keywords(text: string) {
  return new Set(
    searchTerms(text)
      .filter((term) => term.length >= 3 && !scaffolding.has(term))
      .map((term) =>
        term.length > 5 ? term.replace(/(?:ing|ed|s)$/, "") : term,
      ),
  );
}

const facetKinds = [
  /onboarding|questionnaire|sign.?up|activation|first (?:win|useful|value)|progress/i,
  /component|library|libraries|ui kit|button|streaming|tool.call|navigation|layout|calendar/i,
  /marketing|distribution|channel|outreach|network|referral|social/i,
  /video|clip|demo|format|storyboard|voiceover|music/i,
  /measure|conversion|compare|experiment|test|performance|metric|attribution/i,
  /seo|crawl|canonical|indexing|internal links?|search intent/i,
  /article|copy|category|editorial|image alternatives?|readability/i,
  /interview|hiring|recruiter|portfolio|\bcv\b|résumé|resume/i,
  /documentation|setup|installation|starter|configure/i,
];

const newDeliverable =
  /^(?:a[n]? |another |one |two |some |separate |separately |also |visual |concrete |practical )*(?:way\b|how\b|checklist\b|plan\b|method\b|pattern\b|examples?\b|formats?\b|libraries\b|library\b|measure\b|test\b|find\b|show\b|explain\b|answer\b|draft\b|track\b|compare\b|network\b|validate\b|verify\b|choose\b|gather\b)/i;
const capabilities =
  /\b(?:components?|libraries|library|ui kit|template|framework|tool|toolkit|workflow)\b/i;

export function splitProjectTasks(query: string, project?: { name: string }) {
  const original = project
    ? query
        .replace(
          new RegExp(
            `(?:\\bfor\\s+)?${phrasePattern(project.name).source}(?:['’]s)?[,]?`,
            "giu",
          ),
          " ",
        )
        .replace(/\s+/g, " ")
        .trim()
    : query;
  const masked = original.replace(quotes, (match) => "x".repeat(match.length));
  const boundaries = masked.matchAll(
    /\s*(?:[;\n]+|\b(?:and\s+then|and|plus|then|as well as|also)\b|,\s*(?=(?:a[n]?|another|how|second|third)\b))\s*/gi,
  );
  const parts: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    const left = original
      .slice(start, boundary.index)
      .trim()
      .replace(/[,\s]+$/, "");
    const right = original.slice(boundary.index + boundary[0].length).trim();
    const leftWords = keywords(left);
    if (!leftWords.size || keywords(right).size < 2) continue;
    const explicit = newDeliverable.test(right) || /[;\n]/.test(boundary[0]);
    const first = facetKinds.findIndex((kind) => kind.test(left));
    const second = facetKinds.findIndex((kind) =>
      kind.test(right.split(/\band\b|[;\n]/i, 1)[0]),
    );
    const separateDomain = first >= 0 && second >= 0 && first !== second;
    if (
      !explicit &&
      (leftWords.size < 2 || !separateDomain || capabilities.test(left))
    )
      continue;
    parts.push(left);
    start = boundary.index + boundary[0].length;
    if (parts.length === 2) break;
  }
  return parts.length ? [...parts, original.slice(start).trim()] : [];
}

export function namedSearchReference(query: string) {
  const url = query
    .match(/https?:\/\/[^\s<>"”]+/i)?.[0]
    .replace(/[),.;]+$/, "");
  if (url) return url;
  const match =
    query.match(
      /\b(?:named|called|titled|under the name)\s+["“]([^"”\n]+)["”]/i,
    ) ??
    query.match(/^\s*["“]([^"”\n]+)["”]\s*$/) ??
    query.match(
      /\b(?:find|retrieve|locate|show|look up)\s+(?:the\s+)?(?:(?:saved\s+)?(?:post|insight|library|tool|resource)\s+)?["“]([^"”\n]+)["”]/i,
    );
  return match?.[1].trim();
}

export function recordRequirement(query: string, project?: { name: string }) {
  const current = /\b(?:today|current|right now|this (?:week|month))\b/i.test(
    query,
  );
  if (current && /trending|platform.wide|live market/i.test(query))
    return "needs-current-data";
  const fact =
    /\b(?:experiment|a\/b test|audit|study|cohort|conversion (?:rate|uplift)|approval|interview (?:confirmation|date|schedule)|case report|clinical evidence|license review)\b/i.test(
      query,
    );
  const proof =
    current ||
    /\b(?:verified|completed|actual|measured|confirmed|official|precise|exact|production|prove[sd]?|sample size)\b/i.test(
      query,
    );
  const example =
    /\b(?:adapt|inspiration|example[s]? (?:of|for)|another product|as a model)\b/i.test(
      query,
    );
  return fact && proof && !example && (project || /\b(?:my|our)\b/i.test(query))
    ? "needs-project-record"
    : undefined;
}
