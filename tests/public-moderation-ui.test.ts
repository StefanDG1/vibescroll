// @vitest-environment node
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
const requireApp = createRequire(
  new URL("../apps/starter/package.json", import.meta.url),
);
const { createElement } = requireApp("react");
const { renderToStaticMarkup } = requireApp("react-dom/server");
const modulePath = "../apps/starter/components/public-moderation.tsx";
const report = {
  _id: "report-1",
  editionId: "edition-1",
  reason: "privacy",
  state: "open",
  createdAt: 1,
  updatedAt: 2,
};
const response = (result: unknown, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { result } : result), {
    status,
  });

it("renders an explicit load action without fetching reports or exposing moderation controls", async () => {
  const request = vi.spyOn(globalThis, "fetch");
  const { PublicModeration } = await import(modulePath);
  const html = renderToStaticMarkup(createElement(PublicModeration));
  expect(html).toContain("Load reports");
  expect(html).toContain("up to 50 open reports");
  expect(html).not.toContain("Confirm removal");
  expect(request).not.toHaveBeenCalled();
  request.mockRestore();
});
it("loads exactly the explicit bounded open-report operation and strips unrelated payload", async () => {
  const { loadModerationReports } = await import(modulePath);
  const request = vi.fn().mockResolvedValue(
    response([
      {
        ...report,
        organizationId: "private-org",
        key: "private-key",
        payload: "private-notes",
      },
    ]),
  );
  expect(await loadModerationReports(request)).toEqual([report]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe("/api/product");
  expect(request.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    operation: "publicModerationReports",
    args: {},
  });
  await expect(
    loadModerationReports(
      vi.fn().mockResolvedValue(response(Array(51).fill(report))),
    ),
  ).rejects.toThrow("Reports could not be read");
  await expect(
    loadModerationReports(
      vi.fn().mockResolvedValue(response([{ ...report, state: "removed" }])),
    ),
  ).rejects.toThrow("Reports could not be read");
});
it("requires a separate explicit confirmation and sends only report identity and chosen decision", async () => {
  const { reviewModerationReport } = await import(modulePath);
  const request = vi
    .fn()
    .mockImplementation(async () => response({ reviewed: true }));
  await expect(
    reviewModerationReport(report._id, "remove", false, request),
  ).rejects.toThrow("confirm");
  expect(request).not.toHaveBeenCalled();
  for (const action of ["dismiss", "remove"] as const) {
    await reviewModerationReport(report._id, action, true, request);
    expect(JSON.parse(request.mock.lastCall![1].body)).toEqual({
      operation: "publicModerateReport",
      args: { reportId: report._id, action },
    });
  }
  await expect(
    reviewModerationReport(
      report._id,
      "remove",
      true,
      vi.fn().mockResolvedValue(response({})),
    ),
  ).rejects.toThrow("could not be confirmed");
});
it("keeps fresh authentication repair separate from missing moderator authority and hides upstream errors", async () => {
  const { loadModerationReports, reviewModerationReport } = await import(
    modulePath
  );
  await expect(
    loadModerationReports(
      vi
        .fn()
        .mockResolvedValue(response({ error: "private upstream detail" }, 401)),
    ),
  ).rejects.toMatchObject({
    code: "ACCESS_LOST",
    message: expect.stringContaining("Sign in again"),
  });
  await expect(
    reviewModerationReport(
      report._id,
      "remove",
      true,
      vi
        .fn()
        .mockResolvedValue(
          response({ code: "REAUTH_REQUIRED", error: "private detail" }, 400),
        ),
    ),
  ).rejects.toMatchObject({
    code: "REAUTH_REQUIRED",
    message: expect.stringContaining("Sign in again"),
  });
  await expect(
    loadModerationReports(
      vi
        .fn()
        .mockResolvedValue(
          response({ code: "FORBIDDEN", error: "private detail" }, 400),
        ),
    ),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: expect.stringContaining("moderator allowlist"),
  });
});
it("inspects only the explicitly selected report, handles unavailable editions and rejects response misbinding", async () => {
  const { inspectModerationReport } = await import(modulePath);
  const request = vi
    .fn()
    .mockResolvedValue(response({ reportId: report._id, edition: null }));
  expect(await inspectModerationReport(report._id, request)).toBeNull();
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    operation: "publicModerationInspect",
    args: { id: report._id },
  });
  await expect(
    inspectModerationReport(
      report._id,
      vi
        .fn()
        .mockResolvedValue(
          response({ reportId: "other-report", edition: null }),
        ),
    ),
  ).rejects.toThrow("could not be inspected");
});
