import { backend, api } from "@/lib/backend";
import { ActionForm } from "@/components/action-form";
import {
  AccountPageFrame,
  AccountSection,
  AccountStatus,
} from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { applyV1Change } from "@/app/actions";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";
import { notFound } from "next/navigation";
import { ReceiptText } from "lucide-react";

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const back = { href: `/app/${org}/billing`, label: "Billing" };
  if (await localSnapshotRequest()) {
    await (
      await backend()
    ).query(api.organizations.details, {
      organizationId: org as Id<"organizations">,
    });
    return (
      <AccountPageFrame title="Review plan change" back={back}>
        <AccountSection
          title="Quote unavailable"
          icon={ReceiptText}
          description="Open Billing to review your current plan."
        />
      </AccountPageFrame>
    );
  }
  const q = await (
    await backend()
  ).query(api.billingChanges.quote, { id: id as Id<"billingChanges"> });
  if (q.organizationId !== org) notFound();
  const upgrade = q.tier === "pro";
  return (
    <AccountPageFrame title="Review plan change" back={back}>
      <AccountSection
        title={`${q.tier === "pro" ? "Pro" : "Starter"} · ${q.interval}`}
        icon={ReceiptText}
        trailing={<AccountStatus>{q.state}</AccountStatus>}
      >
        <dl className="account-quote">
          <div>
            <dt>Payable now</dt>
            <dd>
              {upgrade ? `EUR ${(q.amount / 100).toFixed(2)}` : "No charge"}
            </dd>
          </div>
          <div>
            <dt>{upgrade ? "Proration calculated" : "Renews on"}</dt>
            <dd>
              {date.format((upgrade ? q.prorationDate : q.periodEnd) * 1000)}{" "}
              UTC
            </dd>
          </div>
          <div>
            <dt>Quote expiration</dt>
            <dd>{date.format(q.expiresAt)} UTC</dd>
          </div>
        </dl>
        <p>
          {upgrade
            ? "The total includes applicable tax. Stripe calculated the proration. Verified payment adds only the remaining period’s incremental credits and preserves credits already spent."
            : "Your current paid allowance continues until renewal."}
        </p>
        <p className="fine">
          Approval applies to this plan change. Task funding remains a separate
          choice.
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
            <label className="checkbox-label">
              <input type="checkbox" required />
              <span>
                I approve this plan change and its stated payment timing.
              </span>
            </label>
          </ActionForm>
        )}
      </AccountSection>
    </AccountPageFrame>
  );
}
