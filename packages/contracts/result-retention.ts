// The finite timestamp records the original processing window. A durable result
// keeps its immutable payload until explicit deletion; it never extends a lease.
export type ResultRetention = {
  resultRetention?: "until_deleted";
  retainUntil: number;
};
export function resultRetained(value: ResultRetention, now = Date.now()) {
  return value.resultRetention === "until_deleted" || value.retainUntil > now;
}
export function completedResultRetained(source: {
  resultRetention?: "until_deleted";
  state?: string;
  personalAnalysis?: { executor?: string; state?: string };
}) {
  return (
    source.resultRetention === "until_deleted" &&
    source.state === "ready" &&
    source.personalAnalysis?.executor === "work_cloud" &&
    source.personalAnalysis.state === "completed"
  );
}
