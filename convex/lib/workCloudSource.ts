import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { presentAnalysis } from "../../packages/insights/presentation";
import { insightOutput, sourceInsightOutput } from "../../packages/contracts";
import { ensure, containsSecret } from "../../packages/policy";
import { sourceRetained, retainedSourceRevision } from "./sourceAuthority";
import { sourcePolicyCurrent } from "./sourcePolicy";
import { settle } from "../product";
import { syncCategories } from "../categories";
import { syncKnowledge } from "../knowledge";
import { internal } from "../_generated/api";
import { validateTranscript } from "../personalAnalysis";
export async function typedSource(
  ctx: QueryCtx,
  source: Doc<"sources">,
  bound: Doc<"sources">["personalAnalysis"] | null = source.personalAnalysis ??
    null,
) {
  const required =
    !!source.currentRevisionId ||
    ["github_repository", "reddit_thread"].includes(source.sourceType ?? "") ||
    source.analysis?.schemaVersion === "2.0.0" ||
    !!bound?.sourceRevisionId;
  ensure(
    !source.publicImportId &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil),
    "SOURCE_UNAVAILABLE",
    "Source rights or retained evidence changed.",
  );
  if (!required) return null;
  const row = source.currentRevisionId
    ? await ctx.db.get(source.currentRevisionId)
    : null;
  const registry = row ? await retainedSourceRevision(ctx, row) : null;
  ensure(
    row &&
      row.sourceId === source._id &&
      row.organizationId === source.organizationId &&
      row.generation === source.generation &&
      registry &&
      sourcePolicyCurrent(registry.revision) &&
      (!bound ||
        (bound.sourceRevisionId === row._id &&
          bound.sourceContentHash === row.contentHash)),
    "INVALID_EVIDENCE",
    "Review the exact current retained source evidence.",
  );
  ensure(
    registry.evidence.map((record) => record.excerpt).join("\n").length <=
      60000,
    "INVALID_EVIDENCE",
    "Source excerpts exceed the approved text bound.",
  );
  return {
    id: row._id,
    revision: registry.revision,
    evidence: registry.evidence,
  };
}

export function validatePersonalTextOutput(
  source: Doc<"sources">,
  value: unknown,
  registry: Awaited<ReturnType<typeof typedSource>>,
  processingRunId: string,
) {
  const output: any = presentAnalysis(
    (registry ? sourceInsightOutput : insightOutput).parse(value) as any,
  );
  ensure(
    JSON.stringify(output).length <= 120000 &&
      !containsSecret(JSON.stringify(output)) &&
      output.sourceId === source._id &&
      output.processingRunId === processingRunId &&
      output.coverage === (registry ? "source_text" : "caption_only"),
    "INVALID_EVIDENCE",
    "Invalid personal source output.",
  );
  ensure(
    !registry ||
      (output.sourceRevisionId === registry.id &&
        output.sourceContentHash === registry.revision.contentHash),
    "INVALID_EVIDENCE",
    "Output is bound to a different retained revision.",
  );
  const allowed = registry
    ? registry.evidence.map((record) => ({
        kind: record.kind,
        id: record.id,
        startMs: null,
        endMs: null,
      }))
    : [
        { kind: "user_note", id: "supplied_text", startMs: null, endMs: null },
        ...(source.acquisition?.description
          ? [
              {
                kind: "caption",
                id: "post_caption",
                startMs: null,
                endMs: null,
              },
            ]
          : []),
      ];
  for (const insight of output.insights) {
    ensure(
      !registry || insight.evidence.length > 0,
      "INVALID_EVIDENCE",
      "Each typed claim needs current source evidence.",
    );
    for (const evidence of insight.evidence)
      ensure(
        allowed.some(
          (e) =>
            e.kind === evidence.kind &&
            e.id === evidence.id &&
            e.startMs === evidence.startMs &&
            e.endMs === evidence.endMs,
        ),
        "INVALID_EVIDENCE",
        "Unverified evidence reference.",
      );
  }
  return output;
}
export async function completePersonalSource(
  ctx: MutationCtx,
  source: Doc<"sources">,
  job: NonNullable<Doc<"sources">["personalAnalysis"]>,
  a: {
    output?: unknown;
    transcript?: unknown;
    usage?: { inputTokens: number; outputTokens: number };
  },
  registry: Awaited<ReturnType<typeof typedSource>>,
  now: number,
  pipelineVersion?: string,
) {
  const media = source.kind !== "text" && !registry;
  const output: any = media
    ? presentAnalysis(
        (registry ? sourceInsightOutput : insightOutput).parse(a.output) as any,
      )
    : validatePersonalTextOutput(
        source,
        a.output,
        registry,
        `${source._id}:${job.generation}`,
      );
  if (media)
    output.warnings = [
      ...new Set([
        "Video frames are sampled; short scenes can be missed. Automatic transcription can contain errors.",
        ...output.warnings,
      ]),
    ].slice(0, 20);
  ensure(
    JSON.stringify(output).length <= 120000 &&
      !containsSecret(JSON.stringify(output)) &&
      output.sourceId === source._id &&
      output.processingRunId === `${source._id}:${job.generation}` &&
      output.coverage ===
        (registry
          ? "source_text"
          : media
            ? source.personalMedia?.coverage
            : "caption_only"),
    "INVALID_EVIDENCE",
    "Invalid personal source output.",
  );
  ensure(
    !registry ||
      (output.sourceRevisionId === registry.id &&
        output.sourceContentHash === registry.revision.contentHash),
    "INVALID_EVIDENCE",
    "Output is bound to a different retained revision.",
  );
  const transcript = media
    ? validateTranscript(a.transcript, source.personalMedia)
    : [];
  const evidenceList = registry
    ? registry.evidence.map((record) => ({
        kind: record.kind,
        id: record.id,
        startMs: null,
        endMs: null,
      }))
    : media
      ? [
          ...transcript.map((s: any) => ({
            kind: "transcript",
            id: s.id,
            startMs: s.startMs,
            endMs: s.endMs,
          })),
          ...source.personalMedia.frames.map((f: any) => ({
            kind: "frame",
            id: f.assetId,
            startMs: f.timestampMs,
            endMs: f.timestampMs,
          })),
        ]
      : [
          {
            kind: "user_note",
            id: "supplied_text",
            startMs: null,
            endMs: null,
          },
        ];
  if (!registry && source.acquisition?.description)
    evidenceList.push({
      kind: "caption",
      id: "post_caption",
      startMs: null,
      endMs: null,
    });
  if (media)
    for (const frame of source.personalMedia.frames) {
      const assetId = ctx.db.normalizeId("assets", frame.assetId);
      const asset = assetId ? await ctx.db.get(assetId) : null;
      ensure(
        asset?.sourceId === source._id &&
          asset.organizationId === source.organizationId &&
          asset.state === "complete" &&
          asset.kind === "evidence",
        "INVALID_EVIDENCE",
        "Frame evidence is unavailable.",
      );
    }
  for (const insight of output.insights) {
    ensure(
      !registry || insight.evidence.length > 0,
      "INVALID_EVIDENCE",
      "Each typed claim needs current source evidence.",
    );
    for (const evidence of insight.evidence)
      ensure(
        evidenceList.some(
          (e: any) =>
            e.kind === evidence.kind &&
            e.id === evidence.id &&
            e.startMs === evidence.startMs &&
            e.endMs === evidence.endMs,
        ),
        "INVALID_EVIDENCE",
        "Unverified evidence reference.",
      );
  }
  ensure(
    !a.usage ||
      [a.usage.inputTokens, a.usage.outputTokens].every(
        (n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000000,
      ),
    "INVALID_INPUT",
    "Invalid plan usage.",
  );
  await settle(
    ctx,
    source.organizationId,
    `source:${source._id}:${job.generation}`,
    0,
  );
  await ctx.db.patch(source._id, {
    state: "ready",
    analysis: output,
    analysisPipelineVersion:
      pipelineVersion ??
      (registry
        ? "official-personal-cited-source-v2"
        : "official-personal-media-text-v1"),
    ...(media
      ? {
          text: transcript.map((s: any) => s.text).join(" "),
          mediaCoverage: output.coverage,
          mediaEvidence: evidenceList,
          originalMediaEvidence: evidenceList,
        }
      : {}),
    summary: output.summary,
    coverage: output.coverage,
    tags: [
      ...new Set([
        ...source.tags,
        ...output.insights.flatMap((i: any) => i.categories),
      ]),
    ].slice(0, 20),
    searchable: [
      source.title,
      source.text,
      ...transcript.map((s: any) => s.text),
      output.summary,
      ...source.tags,
      ...output.insights.flatMap((i: any) => i.categories),
    ].join(" "),
    personalAnalysis: { ...job, state: "completed", ...a.usage },
    error: undefined,
    updatedAt: now,
  });
  await syncCategories(ctx, (await ctx.db.get(source._id))!, output);
  await syncKnowledge(ctx, (await ctx.db.get(source._id))!, {
    enqueue: false,
  });
  if (media)
    await ctx.scheduler.runAfter(0, internal.assets.expireOriginal, {
      sourceId: source._id,
      generation: source.generation,
    });
  await ctx.db.insert("notifications", {
    organizationId: source.organizationId,
    key: `source:${source._id}:${job.generation}`,
    message: "A source summary is ready.",
    read: false,
    createdAt: now,
    updatedAt: now,
  });
  return { accepted: true };
}
