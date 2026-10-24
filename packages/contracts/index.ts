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
export { planInput } from "../plans/contract.mjs";
