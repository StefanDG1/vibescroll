import { z } from "zod";
import { libraryEditFailure } from "./library-edits";

const id = z.string().min(1).max(100);
const version = z.number().int().nonnegative();
const key = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);
export const filingVersion = "vibescroll-evidence-filing-v1";
export const filingReference = z
  .object({
    sourceId: id,
    generation: version,
    revision: version,
    insightId: id,
  })
  .strict();
const context = {
  profileId: id,
  grantVersion: version.positive(),
  reference: filingReference,
};
export const filingStateInput = z
  .object({
    ...context,
    cursor: z.string().max(4096).nullable().optional(),
  })
  .strict();
export const filingReceiptInput = z.object({ ...context, key }).strict();
export const filingInput = z
  .object({
    ...context,
    key,
    explicitlyRequested: z.literal(true),
    origin: z
      .object({ topicId: id, memberId: id, version, excluded: z.boolean() })
      .strict(),
    change: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("exclude") }).strict(),
      z.object({ kind: z.literal("restore") }).strict(),
      z
        .object({
          kind: z.literal("move"),
          destination: z.object({ topicId: id, version }).strict(),
        })
        .strict(),
    ]),
  })
  .strict();
export const filingState = z
  .object({
    schema_version: z.literal(filingVersion),
    profile_id: id,
    grant_version: version.positive(),
    reference: filingReference,
    items: z
      .array(
        z
          .object({
            member_id: id,
            topic_id: id,
            name: z.string().max(160),
            version,
            excluded: z.boolean(),
          })
          .strict(),
      )
      .max(12),
    next_cursor: z.string().max(4096).nullable(),
    coverage: z.string().max(500),
  })
  .strict();
export const filingReceipt = z
  .object({
    schema_version: z.literal(filingVersion),
    profile_id: id,
    grant_version: version.positive(),
    reference: filingReference,
    request_key: key,
    operation: z.enum(["move", "exclude", "restore"]),
    origin_topic_id: id,
    origin_member_id: id,
    origin_version: version,
    excluded: z.boolean(),
    destination: z
      .object({ topic_id: id, member_id: id, version })
      .strict()
      .nullable(),
    applied: z.literal(true),
    processing_started: z.literal(false),
  })
  .strict();
export const filingRejection = z
  .object({
    schema_version: z.literal(filingVersion),
    profile_id: id,
    grant_version: version.positive(),
    reference: filingReference,
    request_key: key,
    status: z.literal("rejected"),
    code: z.enum([
      "APPROVAL_STALE",
      "INVALID_INPUT",
      "POLICY_BLOCKED",
      "FORBIDDEN",
    ]),
    message: z.string().max(250),
  })
  .strict();
export const filingResult = z.union([filingReceipt, filingRejection]);
export const filingOutcome = z
  .object({
    profile_id: id,
    grant_version: version.positive(),
    reference: filingReference,
    receipt: filingReceipt.nullable(),
  })
  .strict();
export type FilingInput = z.infer<typeof filingInput>;
export type FilingState = z.infer<typeof filingState>;
export type FilingReceipt = z.infer<typeof filingReceipt>;

export function sameFilingReference(
  a: z.infer<typeof filingReference>,
  b: z.infer<typeof filingReference>,
) {
  return (
    a.sourceId === b.sourceId &&
    a.generation === b.generation &&
    a.revision === b.revision &&
    a.insightId === b.insightId
  );
}
export function verifiedFilingReceipt(value: unknown, input: FilingInput) {
  const receipt = filingReceipt.parse(value);
  const destination =
    input.change.kind === "move" ? input.change.destination : null;
  if (
    receipt.profile_id !== input.profileId ||
    receipt.grant_version !== input.grantVersion ||
    !sameFilingReference(receipt.reference, input.reference) ||
    receipt.request_key !== input.key ||
    receipt.operation !== input.change.kind ||
    receipt.origin_topic_id !== input.origin.topicId ||
    receipt.origin_member_id !== input.origin.memberId ||
    receipt.origin_version !== input.origin.version + 1 ||
    receipt.excluded !== (input.change.kind !== "restore") ||
    (destination
      ? !receipt.destination ||
        receipt.destination.topic_id !== destination.topicId ||
        receipt.destination.version !== destination.version + 1
      : receipt.destination !== null)
  )
    throw new Error(
      "The receipt does not match this idea filing. Check its existing result.",
    );
  return receipt;
}
export function filingFailure(error: unknown, input: FilingInput) {
  const failure = libraryEditFailure(error, {
    profileId: input.profileId,
    grantVersion: input.grantVersion,
    topicId: input.origin.topicId,
    key: input.key,
  });
  return failure
    ? {
        schema_version: filingVersion,
        profile_id: input.profileId,
        grant_version: input.grantVersion,
        reference: input.reference,
        request_key: input.key,
        status: failure.status,
        code: failure.code,
        message: failure.message,
      }
    : null;
}
