import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ensure } from "../../packages/policy";
import {
  apiModelSelection,
  apiModelTariff,
} from "../../packages/contracts/api-models";
import { socialHash } from "../../packages/social/contracts";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";

const grantPolicy = z
  .strictObject({
    version: z.literal("openai-promotional-grant-v1"),
    id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
    enabled: z.boolean(),
    organizationId: z.string().regex(/^org-[A-Za-z0-9]{10,100}$/),
    projectId: z.string().regex(/^proj_[A-Za-z0-9]{10,100}$/),
    verifiedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    noPaidBillingPlan: z.literal(true),
    maximumJobs: z.number().int().min(1).max(1000),
    maximumRequestNanoUsd: z.number().int().min(1000000).max(50000000),
    maximumTotalNanoUsd: z.number().int().min(1000000).max(10000000000),
    verifiedGrantBalanceNanoUsd: z.number().int().positive().max(500000000000),
    allowedModels: z
      .array(z.enum(["gpt-6-luna", "gpt-6.1-sol"]))
      .min(1)
      .max(2),
    subjects: z
      .array(z.string().regex(/^user_[A-Za-z0-9]{20,80}$/))
      .min(1)
      .max(100),
    contentPolicy: z.literal("public_prepared_evidence_only"),
    providerPermissionReference: z.string().min(10).max(2000),
  })
  .refine(
    (p) =>
      p.maximumJobs * p.maximumRequestNanoUsd <= p.maximumTotalNanoUsd &&
      p.maximumTotalNanoUsd <= p.verifiedGrantBalanceNanoUsd &&
      p.verifiedAt < p.expiresAt,
  );
export type OpenAiGrantPolicy = z.infer<typeof grantPolicy>;

function reviewedOpenAiPolicy() {
  const parsed = grantPolicy.safeParse(
    (() => {
      try {
        return JSON.parse(
          process.env.OPENAI_PROMOTIONAL_CONFIGURATION_JSON ?? "null",
        );
      } catch {
        return null;
      }
    })(),
  );
  return parsed.success && process.env.RESTORE_LOCK !== "true"
    ? parsed.data
    : null;
}

// Completed evidence depends on processing permission, not future funding.
export async function openAiPreparedProcessingReviewHash(preparation: string) {
  const p = reviewedOpenAiPolicy();
  return p
    ? socialHash(
        canonicalJson({ preparation, analysis: p.providerPermissionReference }),
      )
    : null;
}

export function openAiGrantConfiguration(subject: string) {
  const p = reviewedOpenAiPolicy();
  if (!p) return null;
  return p.enabled &&
    process.env.RESTORE_LOCK !== "true" &&
    p.subjects.includes(subject) &&
    p.verifiedAt <= Date.now() &&
    p.expiresAt > Date.now()
    ? p
    : null;
}

// The existing durable service counter stores jobs under distinct policy IDs.
// No minute-window reset or actor deletion can replenish a grant allowance.
export async function openAiGrantCapacity(ctx: QueryCtx, p: OpenAiGrantPolicy) {
  const counter = await ctx.db
    .query("proposalServiceCounters")
    .withIndex("by_policy", (q) => q.eq("policyId", `openai-grant:${p.id}`))
    .unique();
  ensure(
    (counter?.jobs ?? 0) < p.maximumJobs,
    "BUDGET_EXCEEDED",
    "This OpenAI grant allowance is used.",
  );
  return counter;
}

export async function openAiQuoteAuthority(
  ctx: QueryCtx,
  subject: string,
  model: string,
) {
  const p = openAiGrantConfiguration(subject);
  ensure(
    p &&
      p.allowedModels.some((id) => id === model) &&
      process.env.OPENAI_PROMOTIONAL_API_KEY,
    "MODEL_UNAVAILABLE",
    "This OpenAI model is not enabled for this account.",
  );
  await openAiGrantCapacity(ctx, p);
  return {
    policy: p,
    quote: {
      authorityId: p.id,
      policyHash: await socialHash(canonicalJson(p)),
      maximumNanoUsd: p.maximumRequestNanoUsd,
      expiresAt: p.expiresAt,
      tariff: apiModelTariff,
    },
  };
}

export async function openAiRunAuthority(
  run: Doc<"mediaPreparations">,
  subject: string,
) {
  const quoted = run.receipt?.admission?.quote;
  const p = openAiGrantConfiguration(subject);
  const binding = quoted?.openAi;
  ensure(
    p &&
      binding &&
      binding.authorityId === p.id &&
      binding.policyHash === (await socialHash(canonicalJson(p))) &&
      binding.tariff === apiModelTariff &&
      binding.maximumNanoUsd === p.maximumRequestNanoUsd &&
      p.allowedModels.includes(quoted.model),
    "APPROVAL_STALE",
    "The OpenAI funding authority changed.",
  );
  const selection = apiModelSelection(quoted.model, quoted.effort);
  ensure(
    selection.provider === "openai_responses",
    "MODEL_UNAVAILABLE",
    "Use the quoted API model.",
  );
  return { policy: p, selection, quote: binding };
}

export async function reserveOpenAiGeneration(
  ctx: MutationCtx,
  run: Doc<"mediaPreparations">,
  subject: string,
  dispatch: {
    requestHash: string;
    inputTokens: number;
    maximumOutputTokens: number;
    model: string;
    effort: string;
    maximumNanoUsd: number;
  },
) {
  const a = await openAiRunAuthority(run, subject);
  ensure(
    !run.receipt?.analysisDispatch &&
      run.state === "analyzing" &&
      dispatch.model === a.selection.id &&
      dispatch.effort === a.selection.effort &&
      /^[a-f0-9]{64}$/.test(dispatch.requestHash) &&
      Number.isSafeInteger(dispatch.inputTokens) &&
      dispatch.inputTokens > 0 &&
      dispatch.inputTokens <= 48000 &&
      dispatch.maximumOutputTokens === a.selection.maximumOutputTokens &&
      Number.isSafeInteger(dispatch.maximumNanoUsd) &&
      dispatch.maximumNanoUsd > 0 &&
      dispatch.maximumNanoUsd <= a.policy.maximumRequestNanoUsd,
    "APPROVAL_STALE",
    "This generation is already dispatched or differs from its quote.",
  );
  const counter = await openAiGrantCapacity(ctx, a.policy);
  if (counter) await ctx.db.patch(counter._id, { jobs: counter.jobs + 1 });
  else
    await ctx.db.insert("proposalServiceCounters", {
      policyId: `openai-grant:${a.policy.id}`,
      jobs: 1,
    });
  await ctx.db.patch(run._id, {
    receipt: {
      ...run.receipt,
      analysisDispatch: {
        ...dispatch,
        authorityId: a.policy.id,
        policyHash: run.receipt.admission.quote.openAi.policyHash,
        at: Date.now(),
        unknownHoldRetained: true,
      },
    },
  });
}
