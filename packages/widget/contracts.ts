import { chatProposalFailure } from "../contracts/chat-proposals";
import { z } from "zod";

export const widgetVersion = "vibescroll-widget-v1";
export const appOrigin = "https://scroll.companynerve.com";
const id = z.string().min(1).max(300);
export const widgetViews = [
  "home",
  "library",
  "sources",
  "topics",
  "scroll",
  "save",
  "insight",
  "compare",
  "projects",
  "proposal",
  "runs",
  "setup",
  "account",
  "usage",
  "export",
] as const;
export const widgetRoute = z
  .object({
    view: z.enum(widgetViews).default("library"),
    profileId: id.optional(),
    sourceId: id.optional(),
    insightId: id.optional(),
    projectId: id.optional(),
    proposalId: id.optional(),
  })
  .strict();
export type WidgetRoute = z.infer<typeof widgetRoute>;

/** An authenticated tool receipt supplies navigation only; UI reads reauthorize it. */
export function inlineCardRoute(
  operation: string,
  value: Record<string, unknown>,
): WidgetRoute | null {
  if (operation !== "fetch" && operation !== "save_link") return null;
  const parsed = widgetRoute.safeParse({
    view: operation === "fetch" ? "insight" : "save",
    profileId: value.profile_id,
    sourceId: operation === "fetch" ? value.id : value.source_id,
  });
  return parsed.success && parsed.data.sourceId ? parsed.data : null;
}

export const widgetBrowseInput = z
  .object({
    profileId: id.optional(),
    cursor: z.string().max(4096).nullable().optional(),
    offset: z.number().int().min(0).max(49).optional(),
    kind: z
      .enum(["sources", "topics", "jobs", "proposals", "usage"])
      .default("sources"),
  })
  .strict();
export const widgetTopicInput = z
  .object({
    profileId: id.optional(),
    topicId: id,
    cursor: z.string().max(4096).nullable().optional(),
  })
  .strict();
export const widgetProposalInput = z
  .object({ profileId: id.optional(), proposalId: id })
  .strict();
export const widgetExport = z
  .object({
    schemaVersion: z.literal(widgetVersion),
    exportedAt: z.string().datetime(),
    title: z.string().min(1).max(200),
    sources: z
      .array(
        z
          .object({
            id,
            title: z.string().max(200),
            url: z.string().url().max(2048),
            generation: z.number().int().nonnegative(),
            revision: z.number().nonnegative(),
            insights: z
              .array(
                z
                  .object({
                    id,
                    title: z.string().max(200),
                    claim: z.string().max(2000),
                    evidence: z
                      .array(
                        z
                          .object({
                            kind: z.string().max(64),
                            startMs: z
                              .number()
                              .nonnegative()
                              .nullable()
                              .optional(),
                            endMs: z
                              .number()
                              .nonnegative()
                              .nullable()
                              .optional(),
                            label: z.string().max(200).optional(),
                          })
                          .strict(),
                      )
                      .max(10),
                  })
                  .strict(),
              )
              .max(20),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type WidgetExport = z.infer<typeof widgetExport>;

export function safeAppUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.origin !== appOrigin || url.username || url.password || url.hash)
      return null;
    if (!/^\/(?:app(?:\/|$)|connect(?:\/|$)|help(?:\/|$))/.test(url.pathname))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Deep links contain navigation, never authority. Reauthorize after applying. */
export function parseAppRoute(path: unknown): WidgetRoute | null {
  if (
    typeof path !== "string" ||
    path.length > 2048 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted host deep links.
    /[\\#\u0000-\u001f]/.test(path)
  )
    return null;
  try {
    const url = new URL(path, appOrigin);
    const view = url.pathname.slice(1) || "library";
    const parsed = widgetRoute.safeParse({
      view,
      ...Object.fromEntries(url.searchParams),
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ToolRecord = Record<string, unknown>;
export type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: { type: string; text?: string }[];
};
export function decodeToolResult(result: ToolResult): ToolRecord {
  if (result.isError) {
    const data = result.structuredContent;
    const code =
      data && typeof data === "object" && "code" in data
        ? data.code
        : undefined;
    const failure = chatProposalFailure(code);
    if (failure)
      throw Object.assign(new Error(failure.error), {
        code,
        outcome: "rejected",
      });
    throw new Error(
      "This request was not confirmed. Open VibeScroll to check its status before retrying.",
    );
  }
  let value = result.structuredContent;
  if (value === undefined) {
    const text = result.content?.find((item) => item.type === "text")?.text;
    if (!text || text.length > 262144)
      throw new Error("The tool returned no usable result.");
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("The tool result could not be read.");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The tool returned an invalid result.");
  return value as ToolRecord;
}

export function evidenceTime(start: unknown, end?: unknown): string {
  const format = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  if (typeof start !== "number" || !Number.isFinite(start) || start < 0)
    return "Source reference";
  return (
    format(start) +
    (typeof end === "number" && Number.isFinite(end) && end > start
      ? ` to ${format(end)}`
      : "")
  );
}

export function jobPresentation(snapshot: ToolRecord): {
  label: string;
  active: boolean;
  uncertain: boolean;
} {
  const processing = snapshot.processing as ToolRecord | null | undefined;
  const state = String(
    processing?.state ?? snapshot.status ?? snapshot.state ?? "saved",
  );
  const labels: Record<string, string> = {
    saved: "Saved",
    ready: "Insights ready",
    completed: "Analysis complete",
    waiting_for_cloud: "Waiting for Work Cloud",
    queued: "Waiting for analysis",
    claimed: "Preparing analysis",
    running: "Analyzing",
    processing: "Analyzing",
    analyzing: "Finding useful insights",
    acquiring: "Preparing source",
    extracting: "Preparing evidence",
    transcribing: "Transcribing",
    preparing: "Preparing source",
    recovering: "Recovering result",
    unknown: "Status needs checking",
    cancelled: "Stopped",
    failed: "Analysis stopped",
    cancel_requested: "Cancellation requested",
    expired: "Request expired",
    needs_upload: "Source needs review",
    approval_required: "Review required",
  };
  return {
    label: labels[state] ?? "Check current status",
    active: [
      "waiting_for_cloud",
      "queued",
      "claimed",
      "running",
      "processing",
      "analyzing",
      "acquiring",
      "extracting",
      "transcribing",
      "preparing",
      "cancel_requested",
    ].includes(state),
    uncertain: ["unknown", "recovering"].includes(state),
  };
}
