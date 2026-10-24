import type { z } from "zod";
export type PlanInput = {
  scope: string;
  nonGoals: string[];
  files: { path: string; isNew: boolean }[];
  steps: string[];
  tests: string[];
  risks: string[];
  rollout: string;
  rollback: string;
  unknowns: string[];
};
export const planInput: z.ZodObject<{
  scope: z.ZodString;
  nonGoals: z.ZodArray<z.ZodString>;
  files: z.ZodArray<z.ZodObject<{ path: z.ZodString; isNew: z.ZodBoolean }>>;
  steps: z.ZodArray<z.ZodString>;
  tests: z.ZodArray<z.ZodString>;
  risks: z.ZodArray<z.ZodString>;
  rollout: z.ZodString;
  rollback: z.ZodString;
  unknowns: z.ZodArray<z.ZodString>;
}>;
