import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import Stripe from "stripe";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const setting = process.env.VIBESCROLL_STRIPE_PROVIDER_TEST;
const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
it.skipIf(!setting)(
  "accepts an actual Stripe sandbox webhook and settles an isolated wallet once",
  async () => {
    const directory = resolve("outputs/credit-policy-private-20261101");
    expect(resolve(setting!)).toBe(
      resolve(directory, "provider-acceptance-config.private.json"),
    );
    const config = JSON.parse(readFileSync(setting!, "utf8"));
    const record = (name: string, value: unknown) =>
      writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), {
        flag: "wx",
      });
    if (
      existsSync(resolve(directory, "provider-acceptance-intent.private.json"))
    )
      throw Error("RECONCILE_EXISTING_PROVIDER_TEST_FIRST");
    const runId = randomUUID();
    record("provider-acceptance-intent.private.json", {
      atUTC: new Date().toISOString(),
      runId,
      sandboxOnly: true,
      maximumNewCustomers: 1,
      maximumNewSubscriptions: 1,
      realAppWrites: 0,
      noAutomaticPaymentRetry: true,
    });
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
      hash(decoded.stdout) !== config.keySHA256 ||
      !/^sk_test_[A-Za-z0-9_]{30,}$/.test(decoded.stdout)
    )
      throw Error("VERIFIED_SANDBOX_KEY_REQUIRED");
    if (hash(readFileSync(config.cliPath)) !== config.cliSHA256)
      throw Error("CLI_PIN_CHANGED");
    const key = decoded.stdout;
    const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 20000 });
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(null);
    } catch {
      throw Error("SANDBOX_ACCOUNT_VERIFICATION_FAILED");
    }
    expect(account.id).toBe(config.policy.accountId);
    expect(config.policy.mode).toBe("test");
    vi.stubEnv("STRIPE_MODE", "test");
    vi.stubEnv("STRIPE_SECRET_KEY", key);
    vi.stubEnv("STRIPE_ACCOUNT_ID", account.id);
    vi.stubEnv(
      "STRIPE_PRO_CREDIT_POLICY_V2_JSON",
      JSON.stringify(config.policy),
    );
    vi.stubEnv("PILOT_PAYMENT_MEASUREMENT_ENABLED", "false");
    vi.stubEnv("RO_INVOICE_SCOPE_VERIFIED", "false");
    vi.stubEnv("RESTORE_LOCK", "false");
    const t = convexTest(schema, modules);
    await t.mutation(internal.accounts.syncUser, {
      subject: "provider-acceptance",
      name: "Synthetic acceptance",
      email: "provider-acceptance@example.test",
    });
    const actor = t.withIdentity({ subject: "provider-acceptance" });
    const org = await actor.mutation(api.organizations.createPrivate, {});
    const received: Array<{
      eventId: string;
      type: string;
      body: string;
      signature: string;
      status: number;
    }> = [];
    let listener: ChildProcess | undefined,
      subscriptionId: string | undefined,
      customerId: string | undefined;
    const server = createServer(async (request, response) => {
      try {
        if (request.method !== "POST" || request.url !== "/stripe/v1/webhook") {
          response.writeHead(404).end();
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of request) {
          const bytes = Buffer.from(chunk);
          length += bytes.length;
          if (length > 1000000) {
            response.writeHead(413).end();
            return;
          }
          chunks.push(bytes);
        }
        const body = Buffer.concat(chunks).toString("utf8");
        const signature = String(request.headers["stripe-signature"] ?? "");
        const result = await t.fetch("/stripe/v1/webhook", {
          method: "POST",
          body,
          headers: { "stripe-signature": signature },
        });
        const event = JSON.parse(body);
        received.push({
          eventId: event.id,
          type: event.type,
          body,
          signature,
          status: result.status,
        });
        response.writeHead(result.status).end(await result.text());
      } catch {
        response.writeHead(503).end("Retry later");
      }
    });
    try {
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string")
        throw Error("LOCAL_LISTENER_REQUIRED");
      const url = `http://127.0.0.1:${address.port}/stripe/v1/webhook`;
      listener = spawn(
        config.cliPath,
        [
          "listen",
          "--project-name",
          "vibescroll-provider-20261101",
          "--events",
          "invoice.paid,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted",
          "--forward-to",
          url,
        ],
        {
          env: {
            ...process.env,
            STRIPE_API_KEY: key,
            STRIPE_DEVICE_NAME: "VibeScroll isolated provider acceptance",
          },
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "",
        secret: string | undefined;
      const consume = (data: Buffer) => {
        output += data.toString("utf8");
        if (output.length > 100000) listener?.kill();
        secret = output.match(/whsec_[A-Za-z0-9]+/)?.[0];
      };
      listener.stdout?.on("data", consume);
      listener.stderr?.on("data", consume);
      for (let i = 0; !secret && listener.exitCode === null && i < 150; i++)
        await delay(200);
      if (!secret) throw Error("STRIPE_LISTENER_NOT_READY");
      vi.stubEnv("STRIPE_V1_WEBHOOK_SECRET", secret);
      record("provider-listener-ready.private.json", {
        atUTC: new Date().toISOString(),
        pid: listener.pid,
        port: address.port,
        signingSecretHash: hash(secret),
        officialCliVersion: config.cliVersion,
        sandboxOnly: true,
      });
      const customer = await stripe.customers.create(
        {
          name: `VibeScroll synthetic provider acceptance ${runId}`,
          metadata: { product: "vibescroller", synthetic_acceptance: runId },
        },
        { idempotencyKey: `vibescroll:${runId}:customer` },
      );
      customerId = customer.id;
      record("provider-customer-created.private.json", {
        id: customer.id,
        livemode: customer.livemode,
        runId,
      });
      expect(customer.livemode).toBe(false);
      await t.mutation(internal.billing.attach, {
        organizationId: org,
        customerId,
      });
      const method = await stripe.paymentMethods.attach(
        "pm_card_visa",
        { customer: customerId },
        { idempotencyKey: `vibescroll:${runId}:method` },
      );
      await stripe.paymentMethods.update(
        method.id,
        {
          billing_details: {
            name: "Synthetic acceptance",
            address: { country: "DE", postal_code: "10115" },
          },
        },
        { idempotencyKey: `vibescroll:${runId}:country` },
      );
      const sub = await stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{ price: config.policy.prices.monthly, quantity: 1 }],
          default_payment_method: method.id,
          payment_behavior: "error_if_incomplete",
          metadata: { product: "vibescroller", synthetic_acceptance: runId },
          expand: ["latest_invoice"],
        },
        { idempotencyKey: `vibescroll:${runId}:subscription` },
      );
      subscriptionId = sub.id;
      const invoiceId =
        typeof sub.latest_invoice === "string"
          ? sub.latest_invoice
          : sub.latest_invoice?.id;
      record("provider-subscription-created.private.json", {
        id: sub.id,
        customerId,
        invoiceId,
        status: sub.status,
        livemode: sub.livemode,
        runId,
      });
      expect(sub.livemode).toBe(false);
      expect(sub.status).toBe("active");
      const state = () =>
        t.run(async (ctx) => ({
          periods: await ctx.db.query("billingPeriods").collect(),
          wallets: await ctx.db.query("wallets").collect(),
        }));
      let snapshot = await state();
      for (
        let i = 0;
        i < 200 &&
        (!snapshot.periods.length ||
          !received.some((r) => r.type === "invoice.paid" && r.status === 200));
        i++
      ) {
        await delay(200);
        snapshot = await state();
      }
      expect(snapshot.periods).toHaveLength(1);
      expect(snapshot.periods[0]).toMatchObject({
        subscription: sub.id,
        credits: 300,
      });
      expect(snapshot.wallets[0]).toMatchObject({
        granted: 300,
        purchased: 0,
        reserved: 0,
        spent: 0,
      });
      const paid = received.find(
        (r) => r.type === "invoice.paid" && r.status === 200,
      )!;
      const providerEvent = await stripe.events.retrieve(paid.eventId);
      expect(providerEvent.livemode).toBe(false);
      expect(
        "id" in providerEvent.data.object ? providerEvent.data.object.id : null,
      ).toBe(invoiceId);
      const replay = await fetch(url, {
        method: "POST",
        body: paid.body,
        headers: { "stripe-signature": paid.signature },
      });
      expect(replay.status).toBe(200);
      expect(await state()).toEqual(snapshot);
      record("actual-provider-webhook-accepted.private.json", {
        atUTC: new Date().toISOString(),
        runId,
        sandboxOnly: true,
        realAppWrites: 0,
        stripeAccountId: account.id,
        customerId,
        subscriptionId,
        invoiceId,
        actualProviderEventId: paid.eventId,
        providerEventReadBack: true,
        cliForwardedSignatureAccepted: true,
        originalDeliveryGrantedBeforeReplay: true,
        sameSignedReplayNoDuplicate: true,
        creditsGrantedOnlyInIsolatedWallet: 300,
        periodCount: 1,
        eventReceipts: received.map((r) => ({
          eventId: r.eventId,
          type: r.type,
          status: r.status,
          bodySHA256: hash(r.body),
        })),
      });
      writeFileSync(
        resolve(directory, "provider-listener-redacted.private.log"),
        output
          .split(key)
          .join("[redacted]")
          .replace(/whsec_[A-Za-z0-9]+/g, "[signing-secret-redacted]"),
        { flag: "wx" },
      );
    } catch (error) {
      const safe = error as {
        type?: string;
        code?: string;
        statusCode?: number;
      };
      record("actual-provider-webhook-failure.private.json", {
        atUTC: new Date().toISOString(),
        runId,
        type: safe.type ?? "AcceptanceError",
        code: safe.code ?? null,
        status: safe.statusCode ?? null,
        customerId: customerId ?? null,
        subscriptionId: subscriptionId ?? null,
        eventStatuses: received.map((r) => ({
          eventId: r.eventId,
          type: r.type,
          status: r.status,
        })),
        noAutomaticRetry: true,
      });
      throw Error(
        `PROVIDER_ACCEPTANCE_FAILED:${safe.type ?? "assertion_or_readiness"}:${safe.code ?? "none"}`,
      );
    } finally {
      try {
        if (subscriptionId) {
          const owned = await stripe.subscriptions.retrieve(subscriptionId);
          if (
            !owned.livemode &&
            owned.customer === customerId &&
            owned.metadata.synthetic_acceptance === runId
          ) {
            const canceled = await stripe.subscriptions.cancel(
              subscriptionId,
              {},
              { idempotencyKey: `vibescroll:${runId}:cleanup-cancel` },
            );
            record("provider-owned-subscription-cleanup.private.json", {
              id: canceled.id,
              status: canceled.status,
              livemode: canceled.livemode,
              ownedRunVerified: true,
            });
          }
        }
      } catch (error) {
        const safe = error as { code?: string };
        record("provider-owned-subscription-cleanup-failure.private.json", {
          atUTC: new Date().toISOString(),
          subscriptionId,
          code: safe.code ?? "unconfirmed",
          noAutomaticRetry: true,
        });
      } finally {
        listener?.kill();
        await new Promise<void>((done) => server.close(() => done()));
        vi.unstubAllEnvs();
      }
    }
  },
  150000,
);
