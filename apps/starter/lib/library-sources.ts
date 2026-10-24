export function libraryPageAfterContext<T>(current: {
  compact?: boolean;
  sources: T[];
  libraryNext?: string | null;
}) {
  return current.compact
    ? { sources: [], libraryNext: null }
    : { sources: current.sources, libraryNext: current.libraryNext };
}

export function sourceCoverageLabel(coverage?: string | null) {
  if (!coverage) return "Coverage not recorded";
  return (
    {
      full_sampled: "Audio + sampled frames",
      audio_only: "Audio",
      visual_only: "Images",
      caption_only: "Text",
      metadata_only: "Link",
    }[coverage] ?? coverage.replaceAll("_", " ")
  );
}
