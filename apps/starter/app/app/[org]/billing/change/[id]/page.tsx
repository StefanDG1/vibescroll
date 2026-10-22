import Link from "next/link";
import { backend, api } from "@/lib/backend";
import { ActionForm } from "@/components/action-form";
import { applyV1Change } from "@/app/actions";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const q = await (
    await backend()
  ).query(api.billingChanges.quote, { id: id as Id<"billingChanges"> });
  if (q.organizationId !== org) notFound();
  const upgrade = q.tier === "pro",
    expiry = new Date(q.expiresAt).toISOString();
  return (
    <main id="main" className="doc">
      <Link prefetch={false} href={`/app/${org}/billing`}>
        Back to billing
      </Link>
      <h1>Review plan change</h1>
      <section className="panel">
        <h2>
          {q.tier === "pro" ? "Pro" : "Starter"}, {q.interval}
        </h2>
        <p>
          {upgrade
            ? `Payable now: EUR ${(q.amount / 100).toFixed(2)}, including applicable tax. Stripe calculated this exact proration at ${new Date(q.prorationDate * 1000).toISOString()}.`
            : `No charge now. Starter begins at renewal on ${new Date(q.periodEnd * 1000).toISOString()}.`}
        </p>
        <p>
          {upgrade
            ? "Only the remaining period's incremental credits are granted after verified payment. This does not reset credits already spent."
            : "Your current paid allowance continues until renewal."}
        </p>
        <p>
          Quote status: {q.state}. Expires {expiry}. No automatic paid provider
          fallback is authorized by this change.
        </p>
        {q.state === "quoted" && (
          <ActionForm
            action={applyV1Change}
            label={
              upgrade
                ? "Approve this total and upgrade"
                : "Approve downgrade at renewal"
            }
          >
            <input type="hidden" name="quoteId" value={id} />
            <label>
              <input type="checkbox" required />I approve this plan change and
              its stated payment timing.
            </label>
          </ActionForm>
        )}
      </section>
    </main>
  );
}
