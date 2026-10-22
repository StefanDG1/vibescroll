import { z } from "zod";
import { validator } from "./validator.mjs";
import insight from "../../contracts/insight.schema.json";
import sourceInsight from "../../contracts/source-insight-v2.schema.json";
import proposal from "../../contracts/proposal.schema.json";
import runner from "../../contracts/runner-job.schema.json";
// Convert the handoff's deliberately small JSON-schema vocabulary, preserving strict objects.
export const insightOutput = validator(insight);
export const sourceInsightOutput = validator(sourceInsight);
export const proposalOutput = validator(proposal);
export const runnerJob = validator(runner);
export const captureInput = z.strictObject({
  organizationId: z.string(),
  key: z.string().min(8).max(100),
  kind: z.enum(["url", "text", "upload"]),
  url: z.string().max(2048).optional(),
  title: z.string().min(1).max(160),
  text: z.string().max(60000).optional(),
  objectKey: z.string().max(400).optional(),
  rightsAttested: z.literal(true),
});
export const planInput = z.strictObject({
  scope: z.string().min(1).max(4000),
  nonGoals: z.array(z.string().max(500)).max(20),
  files: z
    .array(
      z.strictObject({
        path: z.string().trim().min(1).max(300),
        isNew: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
  steps: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  tests: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
  risks: z.array(z.string().max(1000)).max(20),
  rollout: z.string().max(2000),
  rollback: z.string().max(2000),
  unknowns: z.array(z.string().max(500)).max(20),
});
