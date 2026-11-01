import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import Stripe from "stripe";
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const setting = process.env.VIBESCROLL_PRO_CHECKOUT_TEST;
it.skipIf(!setting)(
  "creates and expires an actual managed sandbox Pro checkout through the application",
  async () => {
    const directory = resolve("outputs/pro-offer-private-20261101");
    expect(resolve(setting!)).toBe(
      resolve(
        "outputs/credit-policy-private-20261101/provider-acceptance-config.private.json",
      ),
    );
    if (existsSync(resolve(directory, "checkout-intent.private.json")))
      throw Error("RECONCILE_EXISTING_CHECKOUT_FIRST");
    const record = (name: string, value: unknown) =>
      writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), {
        flag: "wx",
      });
    const runId = randomUUID();
    record("checkout-intent.private.json", {
      atUTC: new Date().toISOString(),
      runId,
      maximumSessions: 1,
      newCustomers: 0,
      realAppWrites: 0,
      payments: 0,
    });
    const config = JSON.parse(readFileSync(setting!, "utf8"));
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      VIBE_TEST_KEY_FILE: resolve(config.keyFile),
    };
    delete childEnv.PSModulePath;
    const decoded = spawnSync(
      "pwsh.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop';$v=ConvertTo-SecureString ((Get-Content -Raw -LiteralPath $env:VIBE_TEST_KEY_FILE).Trim());[Console]::Out.Write([System.Net.NetworkCredential]::new('',$v).Password)",
      ],
      { env: childEnv, encoding: "utf8", windowsHide: true, timeout: 15000 },
    );
    if (
      decoded.status !== 0 ||
      createHash("sha256").update(decoded.stdout).digest("hex") !==
        config.keySHA256 ||
      !/^sk_test_[A-Za-z0-9_]{30,}$/.test(decoded.stdout)
    )
      throw Error("VERIFIED_SANDBOX_KEY_REQUIRED");
    const stripe = new Stripe(decoded.stdout, {
      maxNetworkRetries: 0,
      timeout: 15000,
    });
    let portalId: string | undefined, sessionId: string | undefined;
    try {
      expect((await stripe.accounts.retrieve(null)).id).toBe(
        config.policy.accountId,
      );
      expect(config.policy.mode).toBe("test");
      const customerId = JSON.parse(
        readFileSync(
          resolve(
            "outputs/credit-policy-private-20261101/provider-customer-created.private.json",
          ),
          "utf8",
        ),
      ).id;
      const customer = await stripe.customers.retrieve(customerId);
      expect(
        !customer.deleted &&
          !customer.livemode &&
          customer.name?.startsWith("VibeScroll synthetic provider acceptance"),
      ).toBe(true);
      const portal = await stripe.billingPortal.configurations.create(
        {
          business_profile: { headline: "VibeScroll sandbox Pro acceptance" },
          features: {
            subscription_update: { enabled: false },
            subscription_cancel: { enabled: true, mode: "at_period_end" },
            payment_method_update: { enabled: true },
            invoice_history: { enabled: true },
            customer_update: { enabled: false },
          },
          metadata: { product: "vibescroller", synthetic_acceptance: runId },
        },
        { idempotencyKey: `vibescroll:${runId}:portal` },
      );
      portalId = portal.id;
      record("checkout-portal-created.private.json", {
        id: portalId,
        livemode: portal.livemode,
      });
      const env = {
        STRIPE_MODE: "test",
        STRIPE_ACCOUNT_ID: config.policy.accountId,
        STRIPE_SECRET_KEY: decoded.stdout,
        STRIPE_PRO_CREDIT_POLICY_V2_JSON: JSON.stringify(config.policy),
        STRIPE_PRO_PORTAL_CONFIG_ID: portalId,
        STRIPE_BILLING_ROUTE: "managed_payments",
        STRIPE_MANAGED_MARKET: "configured_countries",
        APP_URL: "https://scroll.companynerve.com",
      };
      for (const [key, value] of Object.entries(env))
        vi.stubEnv(key, value as string);
      const t = convexTest(schema, modules);
      await t.mutation(internal.accounts.syncUser, {
        subject: runId,
        email: "checkout-acceptance@example.test",
        name: "Synthetic acceptance",
      });
      const user = t.withIdentity({ subject: runId });
      const organizationId = await user.mutation(
        api.organizations.createPrivate,
        {},
      );
      await t.mutation(internal.billing.attach, { organizationId, customerId });
      const url = await user.action(api.billingV1.checkout, {
        organizationId,
        tier: "pro",
        interval: "monthly",
        country: "RO",
        termsAccepted: true,
        immediateService: false,
      });
      expect(new URL(url).hostname).toBe("checkout.stripe.com");
      const billing = await t.run((ctx) =>
        ctx.db
          .query("billing")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .unique(),
      );
      const sessions = await stripe.checkout.sessions.list({
        customer: customerId,
        limit: 3,
      });
      const session = sessions.data.find(
        (s) => s.metadata?.checkoutKey === billing?.checkoutKey,
      );
      expect(session).toBeDefined();
      sessionId = session!.id;
      record("checkout-session-created.private.json", {
        id: sessionId,
        livemode: session!.livemode,
        customerId,
      });
      expect(session).toMatchObject({
        livemode: false,
        mode: "subscription",
        status: "open",
        payment_status: "unpaid",
        currency: "eur",
        amount_total: 3500,
      });
      expect(session!.managed_payments?.enabled).toBe(true);
      expect(session!.metadata?.creditPolicy).toBe(config.policy.version);
      const lines = await stripe.checkout.sessions.listLineItems(sessionId, {
        limit: 2,
      });
      expect(lines.data).toHaveLength(1);
      expect(lines.data[0].price?.id).toBe(config.policy.prices.monthly);
      expect(
        await t.run((ctx) => ctx.db.query("billingPeriods").first()),
      ).toBeNull();
      const portalUrl = await user.action(api.payments.portal, {
        organizationId,
      });
      expect(new URL(portalUrl).hostname).toBe("billing.stripe.com");
      record("checkout-accepted.private.json", {
        atUTC: new Date().toISOString(),
        runId,
        sandboxOnly: true,
        sessionId,
        exactPrice: true,
        amountEURCents: 3500,
        managedPayments: true,
        actualPortalSession: true,
        paymentTaken: false,
        realAppWrites: 0,
        walletGrant: false,
      });
    } catch (error) {
      record("checkout-failed.private.json", {
        atUTC: new Date().toISOString(),
        name: error instanceof Error ? error.name : "Unknown",
        code: error instanceof Stripe.errors.StripeError ? error.code : null,
        status:
          error instanceof Stripe.errors.StripeError ? error.statusCode : null,
      });
      throw Error("SANDBOX_CHECKOUT_FAILED_INSPECT_PRIVATE_RECEIPTS");
    } finally {
      if (sessionId) {
        const expired = await stripe.checkout.sessions.expire(sessionId);
        record("checkout-expired.private.json", {
          id: expired.id,
          status: expired.status,
          livemode: expired.livemode,
        });
        expect(expired.status).toBe("expired");
      }
      if (portalId) {
        const archived = await stripe.billingPortal.configurations.update(
          portalId,
          { active: false },
        );
        record("checkout-portal-archived.private.json", {
          id: archived.id,
          active: archived.active,
        });
        expect(archived.active).toBe(false);
      }
      vi.unstubAllEnvs();
    }
  },
  60000,
);
