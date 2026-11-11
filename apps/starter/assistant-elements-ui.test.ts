import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageSummary } from "./components/usage-summary";
import { CreditMeter } from "./components/assistant-elements/credit-meter";
import { ProjectFitBreakdown } from "./components/assistant-elements/project-fit-breakdown";
import { usageOverview } from "../../packages/billing/usage-overview";
import { suggestProjects } from "./lib/project-suggestions";
import { InsightDiscovery } from "./components/insight-discovery";
import { discoveryPage } from "../../packages/reader/discovery";
import {
  ProcessingAccountSummary,
  processingAccountView,
} from "./components/processing-account-summary";

it("shows no invented source nodes before a search result and renders returned insight citations immediately", () => {
  const loading = renderToStaticMarkup(
    createElement(InsightDiscovery, {
      page: null,
      query: "onboarding",
      busy: true,
      onOpen: () => {},
      onMore: () => {},
    }),
  );
  expect(loading).toContain("Looking for matching posts and insights");
  expect(loading).not.toContain('viewBox="0 0 600 88"');
  expect(loading).not.toContain("0 sources");
  const page = discoveryPage({
    mode: "ranked_v1",
    profile_id: "p",
    grant_version: 1,
    posts: [
      {
        id: "post",
        fetch_id: "post",
        title: "Real cited source",
        url: "https://scroll.companynerve.com/app/p/posts/post",
        reference: { generation: 1, revision: 2 },
      },
    ],
    matches: [
      {
        id: "post~idea",
        post_id: "post",
        kind: "insight",
        title: "Use the useful result first",
        excerpt: "Retained supporting excerpt.",
      },
    ],
    exhausted: false,
    has_more: true,
    next_cursor: "next",
    coverage: "Bounded partial page.",
  });
  const html = renderToStaticMarkup(
    createElement(InsightDiscovery, {
      page,
      query: "onboarding",
      busy: false,
      onOpen: () => {},
      onMore: () => {},
    }),
  );
  expect(html).toContain("Partial results");
  expect(html).toContain("Use the useful result first");
  expect(html).toContain("Real cited source");
  expect(html).toContain("Retained supporting excerpt.");
  expect(html).toContain("Continue search");
  expect(html).toContain("1 matching insights");
  expect((html.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(1);
});
it("keeps unavailable financial scope distinct from an actual zero and validates canonical credit observations", () => {
  const unavailable = renderToStaticMarkup(
    createElement(ProcessingAccountSummary, {
      account: null,
      unavailable: true,
      onOpen: () => {},
    }),
  );
  expect(unavailable).toContain("Credits unavailable for this connection");
  expect(unavailable).not.toContain("0 credits");
  expect(processingAccountView({ availableCredits: 300 })).toBeNull();
  const account = processingAccountView({
    version: "processing-account-v1",
    availableCredits: 0,
    reservedCredits: 11,
    expiredReservedCredits: 3,
    observedAt: 1000,
    nextExpiry: null,
    allowanceKind: "admin",
    monthlyAllowance: 300,
    nextRenewal: 2000,
    processing: {
      allowed: false,
      reason: "QUOTA_EXCEEDED",
      message: "Hourly capacity is used.",
      dimension: "hour",
      retryAt: 3000,
      limit: 20,
      used: 20,
    },
    reviewUrl: "https://scroll.companynerve.com/app/p/usage",
  });
  expect(account?.reservedCredits).toBe(11);
  const zero = renderToStaticMarkup(
    createElement(ProcessingAccountSummary, { account, onOpen: () => {} }),
  );
  expect(zero).toContain("0 credits available");
});

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
