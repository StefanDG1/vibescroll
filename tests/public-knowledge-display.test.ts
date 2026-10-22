import { expect, it } from "vitest";
import {
  publicSlug,
  publicSaveHref,
  publicCitationUrl,
  publicContinuation,
} from "../apps/starter/lib/public-knowledge-display";
it("binds sign-in continuation to one exact public edition without a GET mutation", () => {
  expect(publicSaveHref("permitted-example", 3)).toBe(
    "/app?publicEdition=permitted-example&publicVersion=3",
  );
  for (const slug of [
    "../private",
    "//evil",
    "private?token=x",
    "UPPER",
    "ab",
  ]) {
    expect(publicSlug(slug)).toBe(false);
    expect(publicSaveHref(slug, 1)).toBeNull();
  }
  for (const version of [0, -1, 1.5, NaN, Infinity])
    expect(publicSaveHref("permitted-example", version)).toBeNull();
  expect(
    publicContinuation({
      publicEdition: "permitted-example",
      publicVersion: "3",
      draft: "My permitted source",
    }),
  ).toBe(
    "draft=My+permitted+source&publicEdition=permitted-example&publicVersion=3",
  );
  expect(
    publicContinuation({ publicEdition: "../private", publicVersion: "3" }),
  ).toBe("");
});
it("does not turn unsafe citation values into links", () => {
  for (const value of [
    null,
    "javascript:alert(1)",
    "file:///private",
    "https://token@example.com/",
    "//example.com",
  ])
    expect(publicCitationUrl(value)).toBeNull();
  expect(publicCitationUrl("https://example.com/source#passage")).toBe(
    "https://example.com/source#passage",
  );
});
