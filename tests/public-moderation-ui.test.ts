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
  expect(html).toContain("Load active restrictions");
  expect(html).toContain("Repair a legacy moderation identity");
  expect(request).not.toHaveBeenCalled();
  request.mockRestore();
});
const block = {
  _id: "block-1",
  reportId: "report-1",
  reason: "privacy",
  state: "active",
  version: 3,
  createdAt: 1,
  updatedAt: 2,
};
it("loads only an explicitly requested restriction page and strips private identity data", async () => {
  const { loadModerationBlocks } = await import(modulePath);
  const request = vi.fn().mockResolvedValue(
    response({
      page: [
        {
          ...block,
          canonicalHash: "PRIVATE_HASH",
          publisher: "PRIVATE_ACTOR",
          organizationId: "PRIVATE_ORG",
          releaseNote: "PRIVATE_NOTE",
        },
      ],
      isDone: false,
      continueCursor: "next-page",
    }),
  );
  expect(await loadModerationBlocks(null, request)).toEqual({
    page: [block],
    isDone: false,
    continueCursor: "next-page",
  });
  expect(JSON.parse(request.mock.lastCall![1].body)).toEqual({
    operation: "publicModerationBlocks",
    args: { cursor: null },
  });
  for (const bad of [
    { page: Array(26).fill(block), isDone: true, continueCursor: "" },
    {
      page: [{ ...block, state: "released" }],
      isDone: true,
      continueCursor: "",
    },
    { page: [{ ...block, version: 0 }], isDone: true, continueCursor: "" },
  ])
    await expect(
      loadModerationBlocks(null, vi.fn().mockResolvedValue(response(bad))),
    ).rejects.toThrow("Restrictions could not be read");
});
it("requires a separate reason and confirmation for exact-version release and never publishes", async () => {
  const { releaseModerationRestriction } = await import(modulePath);
  const request = vi.fn().mockResolvedValue(response({ released: true }));
  await expect(
    releaseModerationRestriction(block, "Reviewed rights", false, request),
  ).rejects.toThrow("confirming release");
  await expect(
    releaseModerationRestriction(block, " ", true, request),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  await releaseModerationRestriction(block, " Reviewed rights ", true, request);
  expect(JSON.parse(request.mock.lastCall![1].body)).toEqual({
    operation: "publicReleaseModerationBlock",
    args: {
      id: "block-1",
      expectedVersion: 3,
      note: "Reviewed rights",
      explicitlyApproved: true,
    },
  });
  expect(request).toHaveBeenCalledTimes(1);
  await expect(
    releaseModerationRestriction(
      block,
      "Reviewed rights",
      true,
      vi.fn().mockResolvedValue(response({ published: true })),
    ),
  ).rejects.toThrow("not confirmed");
});
it("repairs only an explicitly confirmed original hash and edition version without releasing a restriction", async () => {
  const { repairModerationIdentity } = await import(modulePath);
  const request = vi.fn().mockResolvedValue(response({ repaired: true }));
  const input = {
    editionId: "edition-1",
    reportId: "report-1",
    expectedEditionVersion: 2,
    canonicalHash: "a".repeat(64),
    note: "Original identity recovered from archived review metadata.",
  };
  await expect(
    repairModerationIdentity(input, false, request),
  ).rejects.toThrow();
  await expect(
    repairModerationIdentity(
      { ...input, canonicalHash: "https://private-source.invalid" },
      true,
      request,
    ),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  await repairModerationIdentity(input, true, request);
  expect(JSON.parse(request.mock.lastCall![1].body)).toEqual({
    operation: "publicRepairLegacyModeration",
    args: { ...input, explicitlyApproved: true },
  });
  expect(request).toHaveBeenCalledTimes(1);
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
