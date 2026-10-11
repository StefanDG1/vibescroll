const minorWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "per",
  "the",
  "to",
  "via",
  "vs",
]);

// Format navigation labels without changing stored names or acronym/brand casing.
export function titleCase(label: string): string {
  const words = [...label.matchAll(/[\p{L}\p{N}]+(?:['’.][\p{L}\p{N}]+)*/gu)];
  let index = 0;
  return label.replace(/[\p{L}\p{N}]+(?:['’.][\p{L}\p{N}]+)*/gu, (word) => {
    const position = index++;
    if (position > 0 && position < words.length - 1 && minorWords.has(word))
      return word;
    return word[0].toLocaleUpperCase("en") + word.slice(1);
  });
}
