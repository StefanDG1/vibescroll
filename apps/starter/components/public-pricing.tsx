import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { proOffer } from "../../../packages/billing/pro-offer";
import { PublicIntro, PublicPage } from "./site";
import { PublicCta } from "./public-cta";

const terms = [
  {
    label: "Monthly",
    interval: "per month",
    allowance: "credits each month",
    offer: proOffer.monthly,
  },
  {
    label: "Yearly",
    interval: "per year",
    allowance: "credits each month",
    offer: proOffer.annual,
  },
  {
    label: "Weekly",
    interval: "every 7 days",
    allowance: "credits every 7 days",
    offer: proOffer.weekly,
  },
];

const features = [
  "Save posts and check evidence behind their insights",
  "Use cached analysis for posts you request",
  "Connect your GitHub projects and review proposals",
  "Share a workspace with members on their own Pro plans",
];

export function PublicPricing() {
  return (
    <PublicPage>
      <PublicIntro title="VibeScroll Pro">
        <p>
          Choose how often your subscription renews. Checkout confirms the
          available offer and total before payment.
        </p>
      </PublicIntro>
      <div className="public-plan-grid" aria-label="Renewal terms in euros">
        {terms.map(({ label, interval, allowance, offer }) => (
          <section className="public-plan" key={label}>
            <h2>{label}</h2>
            <p className="public-plan-price">
              <strong>€{offer.amountCents / 100}</strong>{" "}
              <span>{interval}</span>
            </p>
            <p>
              {offer.credits} {allowance}
            </p>
          </section>
        ))}
      </div>
      <div className="public-actions public-pricing-actions">
        <PublicCta
          prefetch={false}
          className="primary"
          href="/app?view=billing&tier=pro"
          cta="view_pro"
          page="pricing"
        >
          View Pro availability <ArrowRight size={17} aria-hidden="true" />
        </PublicCta>
        <Link className="secondary" href="/help/processing-and-recovery">
          Processing guide
        </Link>
      </div>
      <section
        className="public-pricing-details"
        aria-labelledby="pro-included"
      >
        <div>
          <h2 id="pro-included">Included with Pro</h2>
          <ul className="public-checklist">
            {features.map((feature) => (
              <li key={feature}>
                <Check size={17} aria-hidden="true" /> {feature}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>How credits work</h2>
          <p>
            See the credit estimate before starting paid work. Preparation and
            analysis are quoted separately. Model and video length affect usage.
          </p>
          <p>
            Annual credits replenish monthly. Included credits expire at the end
            of their applicable term. Purchased credits stay separate.
          </p>
          <p>
            Full-catalog browsing requires separate access. The open-source
            edition runs in your own deployment.
          </p>
        </div>
      </section>
      <div className="public-support-links">
        <Link href="/refunds">Refund and withdrawal policy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">Business enquiry</Link>
      </div>
    </PublicPage>
  );
}
