import { z } from "zod";

const id = z.string().min(1).max(100);
const version = z.number().int().nonnegative();
const key = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);
export const libraryEditVersion = "vibescroll-library-edit-v1";
export const libraryChange = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("rename"), name: z.string().min(1).max(160) })
    .strict(),
  z.object({ kind: z.literal("pin"), pinned: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal("structure"),
      parentId: id.nullable(),
      aliases: z.array(z.string().min(1).max(160)).max(8),
    })
    .strict(),
]);
export const libraryEditInput = z
  .object({
    profileId: id,
    grantVersion: version.positive(),
    topicId: id,
    expectedVersion: version,
    expectedLayoutVersion: version,
    key,
    change: libraryChange,
    explicitlyRequested: z.literal(true),
  })
  .strict();
export const libraryEditStateInput = z
  .object({ profileId: id, grantVersion: version.positive(), topicId: id })
  .strict();
export const libraryEditReceiptInput = libraryEditStateInput.extend({ key });
export const libraryEditReceipt = z
  .object({
    schema_version: z.literal(libraryEditVersion),
    profile_id: id,
    grant_version: version.positive(),
    topic_id: id,
    topic_version: version,
    layout_version: version,
    request_key: key,
    operation: z.enum(["rename", "pin", "structure"]),
    applied: z.literal(true),
    processing_started: z.literal(false),
  })
  .strict();
export const libraryEditState = z
  .object({
    schema_version: z.literal(libraryEditVersion),
    profile_id: id,
    grant_version: version.positive(),
    topic: z
      .object({
        id,
        name: z.string().max(160),
        pinned: z.boolean(),
        aliases: z.array(z.string().max(160)).max(8),
        parent_id: id.nullable(),
        version,
        layout_version: version,
      })
      .strict(),
  })
  .strict();
export const libraryEditOutcome = z
  .object({
    profile_id: id,
    grant_version: version.positive(),
    receipt: libraryEditReceipt.nullable(),
  })
  .strict();
const rejectionMessages = {
  APPROVAL_STALE:
    "The topic or access changed. Load the current topic before saving.",
  INVALID_INPUT:
    "The name or folder change is invalid. Review the fields or use the protected library.",
  POLICY_BLOCKED:
    "The topic change is blocked by the current policy. Review it in the protected library.",
  FORBIDDEN:
    "Edit access is unavailable. Review the current connection and library scope.",
} as const;
export const libraryEditRejection = z
  .object({
    schema_version: z.literal(libraryEditVersion),
    profile_id: id,
    grant_version: version.positive(),
    topic_id: id,
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
export const libraryEditResult = z.union([
  libraryEditReceipt,
  libraryEditRejection,
]);

/** Only a structured Convex policy failure proves that its atomic mutation aborted. */
export function libraryEditFailure(error: unknown, request: LibraryEdit) {
  if (
    !error ||
    typeof error !== "object" ||
    !("data" in error) ||
    typeof error.data !== "string"
  )
    return null;
  const code = error.data.split(":", 1)[0] as keyof typeof rejectionMessages;
  if (!Object.hasOwn(rejectionMessages, code)) return null;
  return {
    schema_version: libraryEditVersion,
    profile_id: request.profileId,
    grant_version: request.grantVersion,
    topic_id: request.topicId,
    request_key: request.key,
    status: "rejected" as const,
    code,
    message: rejectionMessages[code],
  };
}
export type LibraryEdit = z.infer<typeof libraryEditInput>;
export type LibraryEditState = z.infer<typeof libraryEditState>;
export type LibraryEditReceipt = z.infer<typeof libraryEditReceipt>;

export function verifiedLibraryEditReceipt(
  value: unknown,
  request: LibraryEdit,
) {
  const receipt = libraryEditReceipt.parse(value);
  const structure = request.change.kind === "structure";
  if (
    receipt.profile_id !== request.profileId ||
    receipt.grant_version !== request.grantVersion ||
    receipt.topic_id !== request.topicId ||
    receipt.request_key !== request.key ||
    receipt.operation !== request.change.kind ||
    receipt.topic_version !== request.expectedVersion + Number(!structure) ||
    receipt.layout_version !== request.expectedLayoutVersion + Number(structure)
  )
    throw new Error(
      "The result does not match this library change. Check its existing receipt.",
    );
  return receipt;
}
