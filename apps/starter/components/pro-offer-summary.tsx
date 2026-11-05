import { proOffer } from "../../../packages/billing/pro-offer";

export function ProOfferSummary() {
  return (
    <section aria-label="Pro pricing">
      <h2>Pro</h2>
      <p className="price">
        €{proOffer.monthly.amountCents / 100}
        <small> / month</small>
      </p>
      <p>{proOffer.monthly.credits} credits each month</p>
      <dl>
        <dt>Yearly</dt>
        <dd>
          €{proOffer.annual.amountCents / 100} / year ·{" "}
          {proOffer.annual.credits} credits each month
        </dd>
        <dt>Weekly</dt>
        <dd>
          €{proOffer.weekly.amountCents / 100} every 7 days ·{" "}
          {proOffer.weekly.credits} credits
        </dd>
      </dl>
      <ul>
        <li>Saved posts, insights and project plans</li>
        <li>Workspaces with each member's own Pro and credits</li>
        <li>Cached analysis for posts you request</li>
        <li>Connect your projects</li>
      </ul>
    </section>
  );
}
