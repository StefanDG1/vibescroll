import { z } from "zod";

const id = z.string().min(1).max(100);
const version = z.number().int().nonnegative();
const key = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);
export const feedbackAction = z.enum([
  "useful",
  "not_relevant",
  "already_implemented",
  "unsafe_unsupported",
  "later",
]);
const context = {
  profileId: id,
  sourceId: id,
  generation: version,
  revision: version,
  grantVersion: version.positive(),
};
export const feedbackStateInput = z
  .object({ ...context, key: key.optional() })
  .strict();
export const feedbackRequest = z
  .object({
    ...context,
    key,
    expectedVersion: version,
    explicitlyRequested: z.literal(true),
    action: feedbackAction,
    note: z.string().max(2000),
  })
  .strict();
export const feedbackState = z
  .object({
    schema_version: z.literal("vibescroll-feedback-v1"),
    profile_id: id,
    grant_version: version.positive(),
    authority_id: id,
    request_key: key,
    source_id: id,
    generation: version,
    revision: version,
    lookup_complete: z.boolean(),
    feedback: z
      .object({
        feedback_id: id,
        key,
        version: version.positive(),
        action: feedbackAction,
        note: z.string().max(2000),
        grant_version: version.positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const feedbackAcknowledgement = z.object({
  feedback_id: id,
  version: version.positive(),
  status: z.literal("recorded"),
  benefit: z.literal("not_measured"),
});
export type FeedbackRequest = z.infer<typeof feedbackRequest>;
export type FeedbackState = z.infer<typeof feedbackState>;
export function verifyFeedbackContext(
  state: FeedbackState,
  input: z.infer<typeof feedbackStateInput>,
) {
  if (
    state.profile_id !== input.profileId ||
    state.grant_version !== input.grantVersion ||
    state.source_id !== input.sourceId ||
    state.generation !== input.generation ||
    state.revision !== input.revision ||
    (input.key !== undefined && state.request_key !== input.key)
  )
    throw new Error(
      "The judgment does not match this source or connection. Reload access.",
    );
}
export function confirmedFeedback(
  state: FeedbackState,
  input: FeedbackRequest,
  acknowledgement?: unknown,
) {
  verifyFeedbackContext(state, input);
  const row = state.feedback;
  const ack =
    acknowledgement === undefined
      ? undefined
      : feedbackAcknowledgement.parse(acknowledgement);
  return (
    !!row &&
    row.key === input.key &&
    row.action === input.action &&
    row.note === input.note.trim() &&
    row.grant_version === input.grantVersion &&
    row.version >= input.expectedVersion &&
    row.version <= input.expectedVersion + 1 &&
    (!ack ||
      (ack.feedback_id === row.feedback_id && ack.version === row.version))
  );
}
