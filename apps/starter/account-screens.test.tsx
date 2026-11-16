import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ local: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/backend", () => ({
  backend: async () => ({ query: mock.query }),
  api: {
    organizations: {
      details: "workspace",
      members: "members",
      invitations: "invitations",
    },
    onboarding: { status: "onboarding" },
    billing: { authorize: "billing" },
    commerce: { catalogue: "catalogue" },
    product: { usage: "usage" },
    billingChanges: { quote: "quote" },
    invoiceOperations: { status: "invoice-access", queue: "invoice-queue" },
  },
}));
vi.mock("@/lib/local-snapshot-request", () => ({
  localSnapshotRequest: mock.local,
}));
vi.mock("@/app/actions", () => ({
  inviteMember: vi.fn(),
  changeMember: vi.fn(),
  revokeInvite: vi.fn(),
  startV1Checkout: vi.fn(),
  cancelV1Subscription: vi.fn(),
  buyV1Credits: vi.fn(),
  requestV1Refund: vi.fn(),
  billingPortal: vi.fn(),
  refreshBilling: vi.fn(),
  applyV1Change: vi.fn(),
  recordInvoiceReceipt: vi.fn(),
}));
vi.mock("@/components/private-library-upgrade", () => ({
  PrivateLibraryUpgrade: () => null,
}));

import TeamPage from "./app/app/[org]/team/page";
import BillingPage from "./app/app/[org]/billing/page";
import QuotePage from "./app/app/[org]/billing/change/[id]/page";
import InvoicesPage from "./app/account/invoices/page";
import { AccountConnections } from "./components/account-connections";

const organizationId = "crew";
const params = Promise.resolve({ org: organizationId });

afterEach(() => vi.resetAllMocks());

it("matches GitHub and credential controls to their existing role boundaries", () => {
  const renderConnections = (role: string, githubConnected: boolean) =>
    renderToStaticMarkup(
      <AccountConnections
        organizationId={organizationId}
        githubConnected={githubConnected}
        providerStatus="stored"
        reviewedModels={0}
        canLoad
        readOnly={role === "viewer"}
        role={role}
        canViewLaunchChecks={false}
        demo={false}
        busy={false}
        call={vi.fn()}
        openProjects={vi.fn()}
      />,
    );

  const admin = renderConnections("admin", false);
  expect(admin).toContain(
    `/api/github/connect?organizationId=${organizationId}`,
  );
  expect(admin).not.toContain('name="secret"');
  expect(renderConnections("admin", true)).not.toContain("Disconnect GitHub");
  expect(renderConnections("member", false)).not.toContain("Link GitHub");

  const owner = renderConnections("owner", true);
  expect(owner).toContain("Disconnect GitHub");
  expect(owner).toContain('name="secret"');
});

it("shows a Team access state without requesting member records as a viewer", async () => {
  mock.query.mockResolvedValue({
    name: "Crew",
    role: "viewer",
    private: false,
  });
  const html = renderToStaticMarkup(await TeamPage({ params }));
  expect(html).toContain("Ask a workspace owner or admin");
  expect(html).not.toContain("Create invitation");
  expect(mock.query).toHaveBeenCalledExactlyOnceWith("workspace", {
    organizationId,
  });
});

it("keeps member invitations available to admins while role changes stay with owners", async () => {
  mock.query.mockImplementation(async (operation) => {
    if (operation === "workspace")
      return { name: "Crew", role: "admin", private: false };
    if (operation === "members")
      return [
        {
          id: "member",
          name: "A member",
          email: "member@example.test",
          role: "member",
        },
      ];
    return [];
  });
  const html = renderToStaticMarkup(await TeamPage({ params }));
  expect(html).toContain("member@example.test");
  expect(html).toContain("Create invitation");
  expect(html).not.toContain("Save role");
});

it("shows the catalogue without opening billing reads or submit actions in the snapshot", async () => {
  mock.local.mockResolvedValue(true);
  mock.query.mockResolvedValue({ legacy: true });
  const html = renderToStaticMarkup(await BillingPage({ params }));
  expect(html).toContain("Allowance and subscription details are unavailable.");
  expect(html).toContain("Compare renewal options");
  expect(html).not.toContain("Continue to checkout");
  expect(mock.query).toHaveBeenCalledExactlyOnceWith("workspace", {
    organizationId,
  });
});

it("presents a bound plan quote with its amount and acknowledgement", async () => {
  mock.query.mockResolvedValue({
    organizationId,
    tier: "pro",
    interval: "monthly",
    state: "quoted",
    amount: 3175,
    prorationDate: 1794831200,
    periodEnd: 1797509600,
    expiresAt: 1794831800000,
  });
  const html = renderToStaticMarkup(
    await QuotePage({
      params: Promise.resolve({ org: organizationId, id: "quote-id" }),
    }),
  );
  expect(html).toContain("EUR 31.75");
  expect(html).toContain("Quote expiration");
  expect(html).toContain("Approve this total and upgrade");
  expect(html).toContain('name="quoteId"');
  expect(html).toContain('value="quote-id"');
});

it("shows the recorded invoice reference and keeps pending submission actions separate", async () => {
  const dueAt = 1794831200000;
  mock.query.mockImplementation(async (operation) => {
    if (operation === "invoice-access") return { allowed: true };
    return {
      mode: "test",
      observedAt: dueAt + 1000,
      isDone: true,
      page: [
        {
          _id: "sent",
          invoiceId: "in_sent",
          organizationId,
          dueAt,
          state: "submitted",
          receipt: "reference-123",
        },
        {
          _id: "open",
          invoiceId: "in_open",
          organizationId,
          dueAt,
          state: "pending",
        },
      ],
    };
  });
  const html = renderToStaticMarkup(
    await InvoicesPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("reference-123");
  expect(html).toContain("Overdue");
  expect(html.match(/Record submission reference/g)).toHaveLength(1);
});
