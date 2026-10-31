import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { preparedCreditQuote } from "../../packages/contracts/prepared-service";
import { settle } from "../product";
import { ensure } from "../../packages/policy";

export async function settlePreparedCredits(
  ctx: MutationCtx,
  run: Doc<"mediaPreparations">,
  durationMs: number,
  outcome: "ready" | "returned_failure" | "never_started",
) {
  const a = run.receipt?.admission;
  if (a?.version !== "prepared-service-admission-v1") return;
  const quote = a.quote;
  const credits =
    outcome === "never_started"
      ? 0
      : outcome === "returned_failure"
        ? run.evidenceId
          ? quote.preparationCredits
          : 0
        : preparedCreditQuote(
            durationMs,
            run.executor,
            quote.reusedEvidenceId !== null,
          ).maximum;
  ensure(
    Number.isSafeInteger(credits) &&
      credits >= 0 &&
      credits <= quote.maximumCredits,
    "BUDGET_EXCEEDED",
    "Prepared processing exceeded its reviewed credit quote.",
  );
  await settle(ctx, run.organizationId, a.reservationKey, credits);
  await ctx.db.patch(run._id, {
    receipt: {
      ...run.receipt,
      billing: {
        tariff: quote.tariff,
        reservationKey: a.reservationKey,
        maximumCredits: quote.maximumCredits,
        chargedCredits: credits,
        preparationCredits: credits === 0 ? 0 : quote.preparationCredits,
        analysisCredits:
          outcome === "ready" && run.executor === "gateway"
            ? credits - quote.preparationCredits
            : 0,
        state: "settled",
        settledAt: Date.now(),
      },
    },
  });
}
