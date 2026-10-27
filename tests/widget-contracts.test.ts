import { expect, it, vi } from "vitest";
import { validateWidgetOutput } from "../packages/widget/outputs";
import { fetchSource, reauthorizeSources } from "../apps/widget/src/data";
import {
  decodeToolResult,
  evidenceTime,
  jobPresentation,
  parseAppRoute,
  safeAppUrl,
  widgetExport,
  widgetRoute,
} from "../packages/widget/contracts";

it("reauthorizes a cached source before deliberate disclosure and rejects changed or revoked evidence", async () => {
  const result = (revision: number) => ({
    id: "source-one",
    title: "Evidence",
    url: "https://scroll.companynerve.com/app/org/library/source-one",
    text: JSON.stringify({
      state: "ready",
      insights: [
        {
          id: "idea",
          title: "A claim",
          claim: "Evidence-backed",
          reference: {
            sourceId: "source-one",
            generation: 1,
            revision,
            insightId: "idea",
          },
          evidence: [],
        },
      ],
    }),
  });
  const source = fetchSource(result(10));
  const call = vi.fn(async () => result(10));
  await reauthorizeSources(call, "org", [source, source]);
  expect(call).toHaveBeenCalledTimes(1);
  call.mockResolvedValue(result(11));
  await expect(reauthorizeSources(call, "org", [source])).rejects.toThrow(
    "Source evidence changed",
  );
  call.mockRejectedValue(new Error("Grant revoked"));
  await expect(reauthorizeSources(call, "org", [source])).rejects.toThrow(
    "Grant revoked",
  );
});

it("treats navigation as bounded data and rejects foreign destinations", () => {
  expect(widgetRoute.parse({})).toEqual({ view: "library" });
  expect(parseAppRoute("/library?sourceId=example")).toMatchObject({
    view: "library",
    sourceId: "example",
  });
  for (const path of [
    "//evil.test/library",
    "/library#token",
    "/library?token=secret",
    "/unknown",
    "/library\\unsafe",
  ])
    expect(parseAppRoute(path)).toBeNull();
  expect(
    safeAppUrl("https://scroll.companynerve.com/app/org/projects?proposal=one"),
  ).toBeTruthy();
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/app/org",
    "https://scroll.companynerve.com/account",
    "https://scroll.companynerve.com/app/org#secret",
  ])
    expect(safeAppUrl(url)).toBeNull();
});
it("preserves untimed citations and never presents uncertain analysis as new work", () => {
  expect(evidenceTime(undefined)).toBe("Source reference");
  expect(evidenceTime(0, 12000)).toBe("0:00 to 0:12");
  expect(jobPresentation({ processing: { state: "unknown" } })).toMatchObject({
    active: false,
    uncertain: true,
  });
  expect(
    jobPresentation({ processing: { state: "recovering" } }),
  ).toMatchObject({ active: false, uncertain: true });
  expect(jobPresentation({ status: "ready" })).toMatchObject({
    active: false,
    uncertain: false,
  });
});
it("rejects exported secrets, raw transcripts and error results instead of displaying them as evidence", () => {
  const snapshot = {
    schemaVersion: "vibescroll-widget-v1",
    exportedAt: new Date().toISOString(),
    title: "Selected knowledge",
    sources: [],
  };
  expect(widgetExport.safeParse(snapshot).success).toBe(true);
  expect(widgetExport.safeParse({ ...snapshot, token: "secret" }).success).toBe(
    false,
  );
  expect(
    widgetExport.safeParse({ ...snapshot, transcript: "private" }).success,
  ).toBe(false);
  expect(() =>
    decodeToolResult({ isError: true, structuredContent: snapshot }),
  ).toThrow();
  expect(() =>
    decodeToolResult({ content: [{ type: "text", text: "x".repeat(262145) }] }),
  ).toThrow();
});

it("rejects unexpected private fields and oversized widget result envelopes", () => {
  const result = {
    profiles: [],
    truncated: false,
    coverage: "No approved records",
  };
  expect(validateWidgetOutput("widget_profiles", result)).toEqual(result);
  expect(() =>
    validateWidgetOutput("widget_profiles", {
      ...result,
      transcript: "private",
    }),
  ).toThrow();
  expect(() =>
    validateWidgetOutput("widget_profiles", {
      ...result,
      coverage: "x".repeat(262145),
    }),
  ).toThrow();
});
