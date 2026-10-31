import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageSummary } from "./components/usage-summary";
import { CreditMeter } from "./components/assistant-elements/credit-meter";
import { ProjectFitBreakdown } from "./components/assistant-elements/project-fit-breakdown";
import { usageOverview } from "../../packages/billing/usage-overview";
import { suggestProjects } from "./lib/project-suggestions";

it("shows real credit use independently of the recent page and keeps expired holds separate", () => {
  const usage = usageOverview(
    {
      wallet: {},
      pools: [
        { granted: 300, spent: 101, reserved: 19 },
        { granted: 50, spent: 20, reserved: 10, expiresAt: 100 },
      ],
      entries: [],
    },
    100,
  );
  const html = renderToStaticMarkup(
    createElement(UsageSummary, { usage, organizationId: "owner" }),
  );
  expect(html).toContain('data-slot="credit-meter"');
  expect(html).toContain("180 available");
  expect(html).toContain(">101</dd>");
  expect(html).toContain(">19</dd>");
  expect(html).toContain("10 reserved credits belong to");
  expect(html).not.toMatch(/\$|USD|monthly|this month/i);
  expect(
    renderToStaticMarkup(
      createElement(CreditMeter, { used: NaN, available: 1, reserved: 0 }),
    ),
  ).toContain("unavailable");
});

it("shows bounded topic arithmetic with missing matches and explicitly unscored history", () => {
  const fit = suggestProjects({ categoryKeys: ["marketing", "coding", "ai"] }, [
    {
      _id: "p",
      fullName: "owned/example",
      enabled: true,
      confirmed: true,
      status: "connected",
      profile:
        "purpose: Marketing analytics\n\nnonGoals: AI or code generation",
    },
  ]).items[0].fit;
  const html = renderToStaticMarkup(
    createElement(ProjectFitBreakdown, { fit, projectName: "owned/example" }),
  );
  expect(html).toContain("33 out of 100");
  expect(html).toContain("1 of 3 post topics");
  expect(html).toContain("No matching terms");
  expect(html).toContain("expected benefit are not scored yet");
  expect(html).not.toMatch(/probability|guaranteed|strong match/i);
});
