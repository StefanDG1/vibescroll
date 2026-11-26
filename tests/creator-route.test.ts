import { expect, it } from "vitest";
import { creatorRouteKey } from "../packages/sources/creator-route";

it("opens the encoded creator segment emitted by post links without changing the stable account", () => {
  for (const key of [
    "instagram:15453872790",
    "tiktok:7015458621131801605",
    "x:123456789",
  ]) {
    expect(creatorRouteKey(key)).toBe(key);
    expect(creatorRouteKey(encodeURIComponent(key))).toBe(key);
  }
});

it("rejects malformed, double-encoded and non-account creator routes", () => {
  for (const segment of [
    "instagram%253A15453872790",
    "%",
    "instagram:../secret",
    "instagram%3A1%2F2",
    "instagram:one:two",
    "youtube:1",
    "x:",
    "instagram:" + "a".repeat(101),
  ])
    expect(creatorRouteKey(segment)).toBeNull();
});
