export type SearchUnit = {
  id: string;
  post: string;
  title: string;
  text: string;
  topics: readonly string[];
};

type RankedPost<T extends SearchUnit> = {
  id: string;
  score: number;
  units: T[];
};

const stopWords = new Set(
  "a an the in of for by on to from is are was what how when where which why and or with about show find me i my this that do does can could please saved examples example ideas idea".split(
    " ",
  ),
);
export const normalizeSearchText = (text: string) =>
  text.normalize("NFKC").toLocaleLowerCase("en-US").trim();

export function searchTerms(text: string) {
  return [
    ...new Set(
      (
        normalizeSearchText(text).match(/[\p{L}\p{N}][\p{L}\p{N}_+#-]*/gu) ?? []
      ).filter((term) => !stopWords.has(term)),
    ),
  ];
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function phrasePattern(phrase: string) {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escape(phrase).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`,
    "iu",
  );
}

export function containsPhrase(text: string, phrase: string) {
  return phrasePattern(phrase.normalize("NFKC")).test(text.normalize("NFKC"));
}

export function rankedLexicalQuery(query: string) {
  const encoder = new TextEncoder();
  const terms = searchTerms(query).filter(
    (term) => encoder.encode(term).length <= 32,
  );
  return terms.slice(0, 16).join(" ") || [...query.trim()].slice(0, 8).join("");
}

export function rankSearchUnits<T extends SearchUnit>(
  query: string,
  channels: readonly T[][],
  project?: { name: string; profile: string },
): RankedPost<T>[] {
  const hits = new Map<string, RankedPost<T>>();
  for (const units of channels) {
    const seen = new Set<string>();
    units.forEach((unit, index) => {
      const hit = hits.get(unit.post) ?? { id: unit.post, score: 0, units: [] };
      if (!seen.has(unit.post)) hit.score += 1 / (21 + index);
      if (hit.units.length < 3 && !hit.units.some(({ id }) => id === unit.id))
        hit.units.push(unit);
      seen.add(unit.post);
      hits.set(unit.post, hit);
    });
  }
  const words = searchTerms(query);
  const terms = new Map(
    [...hits.values()].map((hit) => [
      hit.id,
      new Set(
        searchTerms(
          hit.units.map(({ title, text }) => `${title} ${text}`).join(" "),
        ),
      ),
    ]),
  );
  const matching = (hit: RankedPost<T>, queryWords: readonly string[]) =>
    queryWords.filter((word) => terms.get(hit.id)?.has(word)).length;
  const ordered = [...hits.values()].sort((a, b) => b.score - a.score);
  for (const hit of ordered.slice(0, 20))
    hit.score += 0.004 * matching(hit, words);
  ordered.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (project) {
    const queryWords = searchTerms(
      query.replace(phrasePattern(project.name), " "),
    );
    const projectWords = searchTerms(project.profile);
    for (let index = 1; index < Math.min(ordered.length, 5); index++) {
      const left = ordered[index - 1],
        right = ordered[index];
      const leftMatch = matching(left, queryWords);
      if (
        leftMatch &&
        matching(right, queryWords) >= leftMatch &&
        left.score - right.score <= 0.009 &&
        matching(right, projectWords) >= matching(left, projectWords) + 2
      )
        [ordered[index - 1], ordered[index]] = [right, left];
    }
  }
  return ordered;
}

export function combineSearchTasks<T extends SearchUnit>(
  base: RankedPost<T>[],
  tasks: { query: string; results: RankedPost<T>[] }[],
) {
  const chosen = new Map<string, RankedPost<T>>();
  const citations = new Map<string, T[]>();
  if (base[0]) {
    chosen.set(base[0].id, base[0]);
    citations.set(base[0].id, [base[0].units[0]]);
  }
  const support = tasks.map(({ query, results }) => {
    const words = searchTerms(query);
    const pick =
      results
        .slice(0, 4)
        .find((result) =>
          result.units.some((unit) =>
            searchTerms(unit.text).some((term) => words.includes(term)),
          ),
        ) ?? results[0];
    if (!pick) return { query };
    const previous = chosen.get(pick.id);
    const matching = pick.units.filter((unit) =>
      searchTerms(unit.text).some((term) => words.includes(term)),
    );
    const evidence = matching[0] ?? pick.units[0];
    const required = [
      ...new Map(
        [...(citations.get(pick.id) ?? []), evidence].map((unit) => [
          unit.id,
          unit,
        ]),
      ).values(),
    ];
    citations.set(pick.id, required);
    const units = [
      ...new Map(
        [...required, ...(previous?.units ?? []), ...pick.units].map((unit) => [
          unit.id,
          unit,
        ]),
      ).values(),
    ];
    chosen.set(pick.id, { ...pick, units: units.slice(0, 3) });
    return { query, post_id: pick.id, match_id: evidence.id };
  });
  const top = new Set(base.slice(0, 5).map(({ id }) => id));
  const hits = [...chosen.keys()].some((id) => !top.has(id))
    ? [...chosen.values(), ...base.filter(({ id }) => !chosen.has(id))]
    : base.map((hit) => chosen.get(hit.id) ?? hit);
  return { hits, support };
}
