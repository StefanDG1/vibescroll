"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, RefreshCw } from "lucide-react";
import { ActionForm } from "./action-form";
import { ChoiceSelect } from "./choice-select";
import { startOnboardingCheckout } from "@/app/onboarding/actions";
import { proOffer } from "../../../packages/billing/pro-offer";
import styles from "./onboarding.module.css";
export function OnboardingPayment({
  organizationId,
  countries,
  countryRequired,
  ready,
  returned,
  initialInterval = "monthly",
}: {
  organizationId: string;
  countries: string[];
  countryRequired: boolean;
  ready: boolean;
  returned: boolean;
  initialInterval?: "monthly" | "annual" | "weekly";
}) {
  const [interval, setPlanInterval] = useState<string>(initialInterval);
  const router = useRouter();
  useEffect(() => {
    if (!returned) return;
    let ticks = 0;
    const timer = setInterval(() => {
      if (++ticks > 15) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [returned, router]);
  const offer =
    interval === "annual"
      ? proOffer.annual
      : interval === "weekly"
        ? proOffer.weekly
        : proOffer.monthly;
  return (
    <>
      <h1>Your ideas, ready to use.</h1>
      <p className={styles.subtle}>
        Your setup is saved. Pro unlocks your library and project plans.
      </p>
      <label className={styles.field} htmlFor="onboarding-plan">
        Choose your plan
        <ChoiceSelect
          id="onboarding-plan"
          value={interval}
          onValueChange={setPlanInterval}
          aria-label="Choose your plan"
        >
          <option value="monthly">Monthly</option>
          <option value="annual">Yearly · save 16.7%</option>
          <option value="weekly">Every seven days</option>
        </ChoiceSelect>
      </label>
      <p className={styles.price}>
        €{offer.amountCents / 100}
        <small>
          /
          {interval === "annual"
            ? "year"
            : interval === "weekly"
              ? "week"
              : "month"}
        </small>
      </p>
      <p className={styles.subtle}>
        {offer.credits} credits{" "}
        {interval === "weekly" ? "every seven days" : "each month"}
        {interval === "annual"
          ? ". Billed yearly; credits granted monthly."
          : "."}
      </p>
      <div className={styles.offer}>
        <span>
          <Check size={16} /> Your saved posts and ready insights
        </span>
        <span>
          <Check size={16} /> Projects, workspaces and proposal plans
        </span>
        <span>
          <Check size={16} /> Cached results for posts you request
        </span>
      </div>
      {returned ? (
        <div aria-live="polite">
          <p>We're checking your payment. Your setup is safe.</p>
          <button className={styles.secondary} onClick={() => router.refresh()}>
            <RefreshCw size={15} /> Check again
          </button>
          <Link
            className={styles.secondary}
            href={`/app/${organizationId}/billing`}
          >
            Manage checkout
          </Link>
        </div>
      ) : ready ? (
        <ActionForm
          action={startOnboardingCheckout}
          label="Continue to secure checkout"
        >
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="tier" value="pro" />
          <input type="hidden" name="interval" value={interval} />
          {countryRequired && (
            <label className={styles.field}>
              Billing country
              <ChoiceSelect name="country" defaultValue="RO" required>
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country === "RO" ? "Romania" : country}
                  </option>
                ))}
              </ChoiceSelect>
            </label>
          )}
          <label className={styles.check}>
            <input type="checkbox" name="terms" required />I accept the{" "}
            <Link href="/terms">terms</Link>,{" "}
            <Link href="/refunds">refund and credit expiry policy</Link>, and
            applicable <Link href="/dpa">data processing terms</Link>.
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="immediate" />
            Start service immediately, subject to the refund policy and
            statutory rights.
          </label>
        </ActionForm>
      ) : (
        <output>
          Checkout is temporarily unavailable. Your setup is saved; you can
          return here later.
        </output>
      )}
      {!returned && (
        <Link
          className={styles.secondary}
          href={`/app/${organizationId}/billing`}
        >
          Manage an existing checkout
        </Link>
      )}
      <p className={styles.footnote}>
        Fresh processing and plans use quoted credits. Full-catalog browsing is
        separate. Stripe confirms applicable tax and the total before payment.
      </p>
    </>
  );
}
