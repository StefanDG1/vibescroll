import { sourceLimits } from "../../../packages/sources/limits";
export type ListedSourceFile = { path: string; blobSha: string; size: number };
export function githubSelectionPreset(files: readonly ListedSourceFile[]) {
  const candidates = files
    .filter(
      (file) =>
        /^(readme(?:\.[^/]+)?|licen[cs]e(?:\.[^/]+)?|copying(?:\.[^/]+)?|notice(?:\.[^/]+)?)$/i.test(
          file.path,
        ) || file.path.startsWith("docs/"),
    )
    .sort(
      (a, b) =>
        Number(a.path.startsWith("docs/")) - Number(b.path.startsWith("docs/")),
    );
  let bytes = 0;
  const chosen: string[] = [];
  for (const file of candidates) {
    if (chosen.length >= sourceLimits.github.files) break;
    if (
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      file.size > sourceLimits.github.fileBytes ||
      bytes + file.size > sourceLimits.github.totalBytes
    )
      continue;
    chosen.push(file.path);
    bytes += file.size;
  }
  return chosen;
}
export function sourceDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toISOString();
}
export function acquisitionStage(state: string) {
  const labels: Record<string, string> = {
    saved: "Saved; retrieval not completed",
    fetching: "Retrieving permitted source material",
    ready: "Source retrieval ready; analysis is separate",
    partial: "Partial evidence retrieved; inspect omissions",
    needs_supplied_text: "Supply permitted text to continue",
    unavailable: "Retrieval unavailable",
    rate_limited: "Provider rate limit; explicit retry required",
  };
  return labels[state] ?? "Check the current source status";
}
