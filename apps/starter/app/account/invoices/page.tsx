import Link from "next/link";
import { Download, ReceiptText } from "lucide-react";
import { backend, api } from "@/lib/backend";
import { ActionForm } from "@/components/action-form";
import {
  AccountPageFrame,
  AccountSection,
  AccountStatus,
} from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import { recordInvoiceReceipt } from "@/app/actions";
export const metadata = { robots: { index: false, follow: false } };

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const local = await localSnapshotRequest();
  const c = await backend();
  const access = local ? null : await c.query(api.invoiceOperations.status, {});
  const back = { href: "/account", label: "Profile" };
  if (!access?.allowed)
    return (
      <AccountPageFrame title="Invoice reporting" back={back}>
        <AccountSection
          title="Invoice operator access required"
          description="This queue is available to authorized invoice operators."
          icon={ReceiptText}
        />
      </AccountPageFrame>
    );
  const { cursor } = await searchParams;
  const queue = await c.query(api.invoiceOperations.queue, {
    paginationOpts: { cursor: cursor ?? null, numItems: 20 },
  });
  return (
    <AccountPageFrame
      title="Invoice reporting"
      description={
        queue.mode === "test"
          ? "Sandbox billing records"
          : "Live billing records"
      }
      back={back}
    >
      <AccountSection
        title="Provider settlements"
        description="Download the month’s balance movements, provider fees and payout references for your accountant."
        icon={Download}
      >
        <form
          action="/api/accounting/settlements"
          method="get"
          className="account-actions"
        >
          <label>
            Accounting month
            <input
              type="month"
              name="month"
              required
              defaultValue={new Date(queue.observedAt)
                .toISOString()
                .slice(0, 7)}
              max={new Date(queue.observedAt).toISOString().slice(0, 7)}
            />
          </label>
          <button type="submit" className="secondary">
            Download settlement record
          </button>
        </form>
        <p className="fine">
          A recent sign-in is required. Managed Payments customer invoices come
          from the transaction merchant.
        </p>
      </AccountSection>
      <details className="account-disclosure">
        <summary>Reporting workflow</summary>
        <p>
          Submit applicable invoices through the accountant’s Oblio workflow.
          Use this queue to record the reference afterward. Reconcile
          corrections with the accountant and retain the original record.
        </p>
      </details>
      {queue.page.length === 0 && (
        <AccountSection
          title="Invoice queue"
          icon={ReceiptText}
          description="No reporting tasks on this page."
        />
      )}
      {queue.page.map((task) => (
        <AccountSection
          key={task._id}
          title={`Invoice ${task.invoiceId}`}
          description={`Workspace ${task.organizationId}`}
          trailing={
            <AccountStatus
              tone={
                task.state === "submitted"
                  ? "positive"
                  : task.dueAt < queue.observedAt
                    ? "attention"
                    : "neutral"
              }
            >
              {task.state === "submitted"
                ? "Reference recorded"
                : task.dueAt < queue.observedAt
                  ? "Overdue"
                  : "Awaiting reference"}
            </AccountStatus>
          }
        >
          <p>
            Due{" "}
            <time dateTime={new Date(task.dueAt).toISOString()}>
              {date.format(task.dueAt)} UTC
            </time>
          </p>
          <div className="account-actions">
            <a href={`/api/accounting/${task._id}`} download>
              Download accountant record
            </a>
            <a
              href={`https://dashboard.stripe.com/${queue.mode === "test" ? "test/" : ""}invoices/${encodeURIComponent(task.invoiceId)}`}
              rel="noreferrer"
            >
              Inspect source invoice in Stripe
            </a>
          </div>
          {task.receipt ? (
            <p>Recorded reference: {task.receipt}</p>
          ) : (
            <ActionForm
              action={recordInvoiceReceipt}
              label="Record submission reference"
            >
              <input type="hidden" name="invoiceTaskId" value={task._id} />
              <label>
                Actual submission receipt reference
                <input
                  name="receipt"
                  required
                  minLength={10}
                  maxLength={999}
                  autoComplete="off"
                />
              </label>
              <p>
                You may need to sign in again before recording a reference. Use
                evidence supplied by the accountant after submission.
              </p>
            </ActionForm>
          )}
        </AccountSection>
      ))}
      {!queue.isDone && (
        <Link
          className="button secondary"
          href={`/account/invoices?cursor=${encodeURIComponent(queue.continueCursor)}`}
          prefetch={false}
        >
          Next page
        </Link>
      )}
    </AccountPageFrame>
  );
}
