import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { expect, it } from "vitest";
import {
  candidateGrantWindows,
  type ProInterval,
  proCandidateVersion,
  verifyCandidateSandboxPrices,
} from "../packages/billing/pro-migration-preview";

// Opt-in provider acceptance. CI has no operator credentials or private receipts.
const receiptPath = process.env.VIBESCROLL_PRO_SANDBOX_RECEIPT;
it.skipIf(!receiptPath)(
  "accepts actual sandbox prices through the canonical verifier and preserves every legacy price",
  () => {
    const path = resolve(receiptPath!);
    const directory = resolve("outputs/pro-sandbox-private-20261031") + sep;
    expect(path.startsWith(directory)).toBe(true);
    const bytes = readFileSync(path, "utf8");
    expect(bytes.length).toBeLessThan(200000);
    const receipt = JSON.parse(bytes);
    expect(receipt.policy).toBe(proCandidateVersion);
    expect(receipt.noLiveChanges).toBe(true);
    expect(receipt.createdProducts).toBe(0);
    expect(receipt.modifiedLegacyPrices).toBe(0);
    expect(receipt.legacyBefore.length).toBeGreaterThan(0);
    expect(receipt.legacyAfter).toEqual(receipt.legacyBefore);
    expect(verifyCandidateSandboxPrices(receipt.prices)).toEqual([
      {
        interval: "week",
        priceId: expect.any(String),
        amountCents: 1700,
        credits: 75,
      },
      {
        interval: "month",
        priceId: expect.any(String),
        amountCents: 3500,
        credits: 300,
      },
      {
        interval: "year",
        priceId: expect.any(String),
        amountCents: 35000,
        credits: 300,
      },
    ]);
  },
);

it.skipIf(!receiptPath)(
  "maps six paid provider periods to personal grants without clamped renewal drift",
  () => {
    const directory = resolve(receiptPath!, "..");
    expect(directory).toBe(resolve("outputs/pro-sandbox-private-20261031"));
    const receipt = JSON.parse(
      readFileSync(
        resolve(directory, "paid-window-graphs.private.json"),
        "utf8",
      ),
    );
    const prices = verifyCandidateSandboxPrices(
      JSON.parse(readFileSync(receiptPath!, "utf8")).prices,
    );
    expect(receipt.noLiveChanges).toBe(true);
    expect(receipt.readOnly).toBe(true);
    expect(receipt.scenarios).toHaveLength(6);
    const keys = new Set<string>();
    for (const scenario of receipt.scenarios) {
      const interval = scenario.interval as ProInterval;
      const price = prices.find((p) => p.interval === interval)!;
      const { subscription, invoice } = scenario;
      expect(subscription.status).toBe("active");
      expect(subscription.livemode).toBe(false);
      expect(invoice).toMatchObject({
        status: "paid",
        livemode: false,
        currency: "eur",
        amount_paid: price.amountCents,
        amount_remaining: 0,
        customerId: scenario.customerId,
        subscriptionId: subscription.id,
      });
      expect(invoice.lines).toHaveLength(1);
      const item = subscription.items[0];
      expect(invoice.lines[0]).toMatchObject({
        subscriptionId: subscription.id,
        priceId: price.priceId,
        quantity: 1,
        proration: false,
        period: {
          start: item.current_period_start,
          end: item.current_period_end,
        },
      });
      const args = {
        interval,
        personId: "synthetic-person",
        subscriptionId: subscription.id,
        anchorUTC: item.current_period_start * 1000,
        periodEndUTC: item.current_period_end * 1000,
      };
      const grants = candidateGrantWindows(args);
      expect(grants).toHaveLength(interval === "year" ? 12 : 1);
      expect(grants[0].startUTC).toBe(args.anchorUTC);
      expect(grants.at(-1)!.endUTC).toBe(args.periodEndUTC);
      expect(grants.every((g) => g.credits === price.credits)).toBe(true);
      expect(candidateGrantWindows(args)).toEqual(grants);
      for (const grant of grants) {
        expect(keys.has(grant.key)).toBe(false);
        keys.add(grant.key);
      }
    }
    // Invoice-level periods describe the preceding billing activity, not the
    // new entitlement window. Use the paid line and subscription item period.
    const monthly = receipt.scenarios.find(
      (s: { phase: string; interval: string }) =>
        s.phase === "renewal" && s.interval === "month",
    );
    expect(monthly.invoice.period_end).toBe(
      monthly.subscription.items[0].current_period_start,
    );
    expect(
      new Date(
        monthly.subscription.items[0].current_period_end * 1000,
      ).toISOString(),
    ).toBe("2026-12-31T12:00:00.000Z");
  },
);

it.skipIf(!receiptPath)(
  "preserves actual failed-renewal, single-payment recovery and cancellation evidence",
  () => {
    const directory = resolve(receiptPath!, "..");
    expect(directory).toBe(resolve("outputs/pro-sandbox-private-20261031"));
    const failed = JSON.parse(
      readFileSync(
        resolve(directory, "failed-renewal-v2-outcome.private.json"),
        "utf8",
      ),
    );
    expect(failed.subscription.status).toBe("past_due");
    expect(failed.invoice).toMatchObject({
      status: "open",
      amount_paid: 0,
      amount_due: 3500,
      livemode: false,
    });
    expect(failed.failureEvents).toHaveLength(1);
    const accepted = JSON.parse(
      readFileSync(
        resolve(directory, "recovery-cancellation-acceptance.private.json"),
        "utf8",
      ),
    );
    expect(accepted).toMatchObject({
      noLiveChanges: true,
      replaySameInvoice: true,
      paidEventCount: 1,
      invoiceCount: 3,
      noNewRenewalInvoice: true,
    });
    expect(accepted.recoveredInvoice).toMatchObject({
      id: failed.invoice.id,
      status: "paid",
      amount_paid: 3500,
      livemode: false,
    });
    expect(accepted.subscription).toMatchObject({
      id: failed.subscription.id,
      status: "canceled",
      livemode: false,
    });
  },
);
