import { expect, it } from "vitest";
import {
  libraryEditFailure,
  libraryEditInput,
  verifiedLibraryEditReceipt,
} from "../packages/widget/library-edits";

const request = libraryEditInput.parse({
  profileId: "profile",
  grantVersion: 3,
  topicId: "topic",
  expectedVersion: 4,
  expectedLayoutVersion: 2,
  key: "synthetic-request",
  explicitlyRequested: true,
  change: { kind: "rename", name: "Current topic" },
});
const receipt = {
  schema_version: "vibescroll-library-edit-v1",
  profile_id: "profile",
  grant_version: 3,
  topic_id: "topic",
  topic_version: 5,
  layout_version: 2,
  request_key: "synthetic-request",
  operation: "rename",
  applied: true,
  processing_started: false,
};

it("does not treat a generic transport error as a definite rejection", () => {
  expect(
    libraryEditFailure(new Error("APPROVAL_STALE: transport text"), request),
  ).toBeNull();
  expect(
    libraryEditFailure({ data: "INTERNAL: private diagnostic" }, request),
  ).toBeNull();
});
it("returns fixed policy text without passing server diagnostics into the widget", () => {
  const result = libraryEditFailure(
    { data: "INVALID_INPUT: SECRET server-only diagnostic" },
    request,
  );
  expect(result).toMatchObject({
    status: "rejected",
    code: "INVALID_INPUT",
    request_key: request.key,
  });
  expect(JSON.stringify(result)).not.toContain("SECRET");
});
it.each([
  { profile_id: "other-profile" },
  { grant_version: 2 },
  { topic_id: "other-topic" },
  { request_key: "other-request-key" },
  { operation: "pin" },
  { topic_version: 4 },
  { layout_version: 3 },
])("does not confirm a mismatched edit receipt: %j", (patch) => {
  expect(() =>
    verifiedLibraryEditReceipt({ ...receipt, ...patch }, request),
  ).toThrow();
});
it("confirms only the exact correlated versioned result", () => {
  expect(verifiedLibraryEditReceipt(receipt, request)).toEqual(receipt);
});
