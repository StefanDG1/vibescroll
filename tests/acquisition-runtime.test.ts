import { expect, it } from "vitest";
import { acquisitionPolicy as backendPolicy } from "../packages/media/acquisition";
import { acquisitionPolicy as localPolicy } from "../packages/media/acquisition-runtime";
import { PolicyError, safeSourceUrl as backendUrl } from "../packages/policy";
import { safeSourceUrl as localUrl } from "../packages/media/acquisition-policy.mjs";

it("local and backend acquisition use the same bounded policy while retaining backend public error codes", () => {
  for (const url of [
    "https://youtube.com/watch?v=abcdefghijk&tracking=remove#section",
    "https://youtu.be/abcdefghijk?t=30&tracking=remove",
    "https://www.instagram.com/reel/abcdef123/",
    "https://vimeo.com/12345678",
    "https://www.tiktok.com/@synthetic/video/1234567890123456789",
  ]) {
    expect(localPolicy(url)).toEqual(backendPolicy(url));
    expect(localUrl(url)).toBe(backendUrl(url));
  }
  for (const url of [
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com/playlist?list=example",
    "https://user:secret@youtube.com/watch?v=abcdefghijk",
    "https://localhost/video/12345678",
    "https://youtube.com/a/../watch?v=abcdefghijk",
  ]) {
    expect(() => localPolicy(url)).toThrow(/UNSUPPORTED_SOURCE/);
    try {
      backendPolicy(url);
      throw Error("Expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyError);
      expect((error as PolicyError).data).toMatch(/^UNSUPPORTED_SOURCE:/);
    }
  }
});
