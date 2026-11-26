import { expect, it } from "vitest";
import { acquisitionPolicy as backendPolicy } from "../packages/media/acquisition";
import { acquisitionPolicy as localPolicy } from "../packages/media/acquisition-runtime";
import { PolicyError, safeSourceUrl as backendUrl } from "../packages/policy";
import { safeSourceUrl as localUrl } from "../packages/media/acquisition-policy.mjs";
import { privateCloudMediaIdentity } from "../packages/social/contracts";
import { platformPostKey } from "../packages/sources/post-identity";

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

it("preserves Instagram share tokens until a first-party redirect proves the post ID", () => {
  for (const route of ["p", "reel"]) {
    const url = `https://www.instagram.com/share/${route}/Example11/`;
    expect(backendPolicy(url).platform).toBe("instagram");
    expect(privateCloudMediaIdentity(url).url).toBe(url);
    expect(platformPostKey(url)).toBeUndefined();
  }
  const direct = "https://www.instagram.com/author/reels/Example11/";
  expect(privateCloudMediaIdentity(direct).url).toBe(
    "https://www.instagram.com/p/Example11/",
  );
  expect(platformPostKey(direct)).toBe("instagram:Example11");
  expect(() =>
    backendPolicy("https://www.instagram.com/share/story/Example11/"),
  ).toThrow();
});
