import { z } from "zod";
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
