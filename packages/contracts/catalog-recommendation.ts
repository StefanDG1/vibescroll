type Settings = {
  requestedModel: string;
  requestedEffort: string;
  reportedModel: string | null;
  reportedEffort: string | null;
};
const effortRank = ["low", "medium", "high", "xhigh"];
// This is the operator's preference, not a measured model-quality score. A
// reported mismatch never gets promoted using the stronger requested setting.
export function preferredCatalogCandidate(
  candidate: Settings,
  incumbent: Settings,
  models?: readonly string[],
) {
  if (!models?.length) return false;
  const rank = (value: Settings) => {
    const model = value.reportedModel ?? value.requestedModel;
    const effort = value.reportedEffort ?? value.requestedEffort;
    return { model: models.indexOf(model), effort: effortRank.indexOf(effort) };
  };
  const next = rank(candidate),
    previous = rank(incumbent);
  return (
    next.model >= 0 &&
    (previous.model < 0 ||
      next.model < previous.model ||
      (next.model === previous.model &&
        next.effort >= 0 &&
        next.effort > previous.effort))
  );
}
