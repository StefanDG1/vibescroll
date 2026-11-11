import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { privateCloudMediaIdentity } from "../../packages/social/contracts";
import { preparedCreditQuote } from "../../packages/contracts/prepared-service";
import { settle, digest } from "../product";
import { ensure } from "../../packages/policy";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { settleProviderExposure, safeNanoUsd } from "./providerFunding";
import {
  apiModelSelection,
  apiModelTariff,
} from "../../packages/contracts/api-models";

export async function settlePreparedCredits(
  ctx: MutationCtx,
  run: Doc<"mediaPreparations">,
  durationMs: number,
  outcome: "ready" | "returned_failure" | "never_started",
) {
  const a = run.receipt?.admission;
  if (a?.version !== "prepared-service-admission-v1") return;
  const quote = a.quote;
  const model =
    quote.apiTariff === apiModelTariff
      ? apiModelSelection(quote.model, quote.effort).id
      : undefined;
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
            model,
            privateCloudMediaIdentity(run.canonical).platform === "x"
              ? "post"
              : "video",
          ).maximum;
  ensure(
    Number.isSafeInteger(credits) &&
      credits >= 0 &&
      credits <= quote.maximumCredits,
    "BUDGET_EXCEEDED",
    "Prepared processing exceeded its reviewed credit quote.",
  );
  await settle(ctx, run.organizationId, a.reservationKey, credits);
  if (a.providerReservationId) await settlePreparedProvider(ctx, run);
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

// Gateway accounting is separate from the user tariff and Vercel sandbox costs.
// ASR currently returns only a price ceiling, so its entire operation stays held.
export async function settlePreparedProvider(
  ctx: MutationCtx,
  run: Doc<"mediaPreparations">,
) {
  const reservationId = run.receipt?.admission?.providerReservationId;
  if (!reservationId) return;
  const row = await ctx.db.get(
    reservationId as import("../_generated/dataModel").Id<"providerFundingReservations">,
  );
  if (!row || ["settled", "released"].includes(row.state)) return;
  ensure(
    row.operationKey === run.receipt.admission.reservationKey &&
      row.requestHash === run.receipt.admission.quoteHash,
    "COST_RECONCILIATION_REQUIRED",
    "The provider settlement differs from its admitted media operation.",
  );
  if (row.dispatches.length === 0) {
    await settleProviderExposure(ctx, row._id, {
      state: "unused",
      receiptHash: await digest(
        canonicalJson({
          runId: run._id,
          proof: "finished_before_gateway_dispatch",
        }),
      ),
    });
    return;
  }
  const receipt = run.receipt?.analysis;
  if (
    row.dispatches.includes("transcription") ||
    !row.dispatches.includes("analysis") ||
    receipt?.model !== "meta/muse-spark-1.3-contributor" ||
    receipt.provider !== "meta" ||
    !/^[a-f0-9]{64}$/.test(
      run.receipt?.analysis_output?.responseSha256 ?? "",
    ) ||
    ![receipt.inputTokens, receipt.outputTokens].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  ) {
    await settleProviderExposure(ctx, row._id, { state: "unknown" });
    return;
  }
  let actualNanoUsd: number;
  try {
    actualNanoUsd = safeNanoUsd(
      receipt.inputTokens * 100 + receipt.outputTokens * 200,
    );
  } catch {
    await settleProviderExposure(ctx, row._id, {
      state: "unknown",
      block: true,
    });
    return;
  }
  await settleProviderExposure(ctx, row._id, {
    state: "known",
    actualNanoUsd,
    basis: "reported_tariff_usage",
    receiptHash: await digest(
      canonicalJson({
        model: receipt.model,
        inputTokens: receipt.inputTokens,
        outputTokens: receipt.outputTokens,
        responseSha256: run.receipt.analysis_output.responseSha256,
      }),
    ),
  });
}
