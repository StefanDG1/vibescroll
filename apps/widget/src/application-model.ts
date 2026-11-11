import { profilesOf, type Profile } from "./data";
import type { ToolRecord } from "../../../packages/widget/contracts";

export type Continuation = { cursor: string } | { offset: number };
export function continuationOf(value: ToolRecord): Continuation | null {
  if (typeof value.next_cursor === "string" && value.next_cursor)
    return { cursor: value.next_cursor };
  if (
    typeof value.next_offset === "number" &&
    Number.isInteger(value.next_offset) &&
    value.next_offset >= 0
  )
    return { offset: value.next_offset };
  return null;
}
export function bootstrapProfiles(snapshot: ToolRecord | null): Profile[] {
  return snapshot && Array.isArray(snapshot.profiles)
    ? profilesOf(snapshot)
    : [];
}
/** Explicit route, saved default and personal fallback are resolved by the server. */
export function selectedWorkspace(
  snapshot: ToolRecord | null,
  profiles: Profile[],
  explicit?: string,
) {
  if (explicit && profiles.some((p) => p.profile_id === explicit))
    return explicit;
  if (
    typeof snapshot?.selected_profile_id === "string" &&
    profiles.some((p) => p.profile_id === snapshot.selected_profile_id)
  )
    return snapshot.selected_profile_id;
  return profiles.length === 1 ? profiles[0].profile_id : "";
}
export function isAccessFailure(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    [
      "FORBIDDEN",
      "AUTH_REQUIRED",
      "PAYMENT_REQUIRED",
      "APPROVAL_STALE",
      "SOURCE_UNAVAILABLE",
    ].includes(String(error.code))
  );
}
export function boundedMerge<T extends { id: string }>(
  previous: T[],
  next: T[],
  maximum = 100,
) {
  return [
    ...new Map([...previous, ...next].map((item) => [item.id, item])).values(),
  ].slice(-maximum);
}
