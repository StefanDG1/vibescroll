"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, RefreshCw } from "lucide-react";
import { ActionForm } from "./action-form";
import { SearchChoices } from "./search-choices";
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
  return (
    <>
      <h1>Continue with Pro.</h1>
      <fieldset className={styles.planChoices}>
        <legend className="sr-only">Choose your plan</legend>
        {(["monthly", "annual", "weekly"] as const).map((value) => {
          const item = proOffer[value];
          return (
            <label
              key={value}
              className={styles.planChoice}
              data-selected={interval === value}
            >
              <input
                type="radio"
                name="plan-choice"
                value={value}
                checked={interval === value}
                onChange={() => setPlanInterval(value)}
              />
              <span>
                {value === "annual"
                  ? "Yearly"
                  : value === "weekly"
                    ? "Weekly"
                    : "Monthly"}
              </span>
              <strong>€{item.amountCents / 100}</strong>
              <small>
                {item.credits} credits{value === "weekly" ? "/week" : "/month"}
              </small>
            </label>
          );
        })}
      </fieldset>
      {interval === "annual" && (
        <p className={styles.footnote}>
          Billed yearly. Credits granted monthly. Save 16.7%.
        </p>
      )}
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
            <div className={styles.field}>
              <span>Billing country</span>
              <SearchChoices
                name="country"
                defaultValue="RO"
                label="Find your billing country"
                options={countries.map((value) => ({
                  value,
                  label:
                    new Intl.DisplayNames(["en"], { type: "region" }).of(
                      value,
                    ) ?? value,
                }))}
              />
            </div>
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
