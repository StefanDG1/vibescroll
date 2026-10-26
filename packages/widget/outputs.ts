import { z } from "zod";
import { safeAppUrl, widgetVersion } from "./contracts";
import {
  libraryEditState,
  libraryEditResult,
  libraryEditOutcome,
} from "./library-edits";

const id = z.string().min(1).max(300);
const version = z.number().int().nonnegative();
const title = z.string().max(200);
const url = z
  .string()
  .max(2048)
  .refine((value) => !!safeAppUrl(value));
const reference = z
  .object({
    sourceId: id,
    generation: version,
    revision: version,
    insightId: id,
  })
  .strict();
const source = z
  .object({
    id,
    title,
    state: z.string().max(100),
    kind: z.string().max(100),
    generation: version,
    revision: version,
    coverage: z.string().max(100).nullable(),
    url,
    insights: z
      .array(
        z
          .object({
            id,
            fetch_id: id,
            title,
            claim: z.string().max(600),
            reference,
          })
          .strict(),
      )
      .max(4),
    more_ideas: z.boolean(),
  })
  .strict();
const job = z
  .object({
    id,
    source_id: id,
    title,
    status: z.string().max(100),
    generation: version,
    revision: version,
    processing: z
      .object({
        executor: z.literal("work_cloud"),
        state: z.string().max(100),
        stage: z.string().max(100).nullable(),
      })
      .strict()
      .nullable(),
    url,
  })
  .strict();
const topic = z
  .object({
    id,
    name: z.string().max(160),
    parent_id: id.nullable(),
    pinned: z.boolean(),
    version,
  })
  .strict();
const proposal = z
  .object({
    id,
    title,
    state: z.string().max(100),
    version,
    repository_id: id,
    evaluation_id: id.optional(),
    url,
  })
  .strict();
const base = { profile_id: id, grant_version: version };
const cursor = z.string().max(4096).nullable().optional();
const coverage = z.string().max(1000);
export const widgetOutputs = {
  widget_library_state: libraryEditState,
  widget_library_edit: libraryEditResult,
  widget_library_receipt: libraryEditOutcome,
  widget_profiles: z
    .object({
      profiles: z
        .array(
          z
            .object({
              profile_id: id,
              name: title,
              grant_version: version,
              expires_at: z.number().nullable(),
              projects: z.array(z.never()).length(0),
            })
            .strict(),
        )
        .max(50),
      truncated: z.boolean(),
      coverage,
    })
    .strict(),
  widget_state: z
    .object({
      schema_version: z.literal(widgetVersion),
      ...base,
      name: title,
      role: z.enum(["owner", "admin", "member", "viewer"]),
      expires_at: z.number().nullable(),
      scope: z.enum(["all", "personal", "business", "selected_sources"]),
      automatic_analysis: z.boolean(),
      cloud_request_policy: z.string().max(100).nullable(),
      processing_route: z.enum(["local", "cloud", "save_only"]).nullable(),
      actions: z
        .object({
          jobs: z.boolean(),
          context: z.boolean(),
          save: z.boolean(),
          feedback: z.boolean(),
          analysis: z.boolean(),
          cloud: z.boolean(),
          draft: z.boolean(),
          events: z.boolean(),
          organize: z.boolean().optional(),
        })
        .strict(),
      links: z
        .object({
          home: url,
          connections: url,
          projects: url,
          usage: url,
          privacy: url,
          account: url,
        })
        .strict(),
      notice: z.string().max(1000),
    })
    .strict(),
  widget_browse: z
    .object({
      ...base,
      items: z.array(z.union([source, job, topic, proposal])).max(10),
      next_cursor: cursor,
      next_offset: z.number().int().min(0).max(49).nullable().optional(),
      review_url: url.optional(),
      coverage,
    })
    .strict(),
  widget_topic: z
    .object({
      ...base,
      topic: z.object({ id, name: z.string().max(160), version }).strict(),
      items: z.array(source).max(5),
      next_cursor: cursor,
      coverage,
    })
    .strict(),
  widget_proposal: z
    .object({
      id,
      title,
      body: z.string().max(20000),
      state: z.string().max(100),
      version,
      hash: z.string().max(512),
      references: z.array(reference).max(128),
      repository_id: id,
      base_sha: z.string().max(100),
      review_url: url,
      editable_in_app: z.literal(true),
      publication_started: z.literal(false),
      coding_started: z.literal(false),
      note: z.string().max(1000),
    })
    .strict(),
} as const;

export function validateWidgetOutput(
  operation: string,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const schema = widgetOutputs[operation as keyof typeof widgetOutputs];
  if (!schema) return value;
  if (new TextEncoder().encode(JSON.stringify(value)).length > 262144)
    throw new Error(
      "Open this bounded result in the protected VibeScroll app.",
    );
  return schema.parse(value);
}
