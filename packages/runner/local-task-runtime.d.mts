export const sourceTextRuntime: Readonly<{
  schemaVersion: "local-task-runtime-v1";
  features: readonly ["source_reanalysis_text_v1"];
}>;
export function validLocalTaskRuntime(value: unknown): value is {
  schemaVersion: "local-task-runtime-v1";
  features:
    | ["source_reanalysis_text_v1"]
    | ["source_reanalysis_text_v1", "project_private_variant_v1"]
    | [
        "source_reanalysis_text_v1",
        "project_private_variant_v1",
        "project_apply_source_v1",
      ];
};
export function sourceTextTask(job: unknown): boolean;
export function versionedTask(job: unknown): boolean;
export const structuredDeveloperInstructions: string;
export function strictSchema(raw: any): any;
export function structuredThreadParams(model: string): any;
export function structuredTurnParams(
  threadId: string,
  model: string,
  effort: string,
  schema: any,
  input: unknown,
  frames: string[],
): any;
export function sourceStructuredBytes(
  schema: unknown,
  input: unknown,
  model: string,
  effort: string,
): number;

export const projectVariantRuntime: Readonly<{
  schemaVersion: "local-task-runtime-v1";
  features: readonly [
    "source_reanalysis_text_v1",
    "project_private_variant_v1",
  ];
}>;
export function projectVariantTask(job: unknown): boolean;
export const projectApplyRuntime: Readonly<{
  schemaVersion: "local-task-runtime-v1";
  features: readonly [
    "source_reanalysis_text_v1",
    "project_private_variant_v1",
    "project_apply_source_v1",
  ];
}>;
export function projectApplyTask(job: unknown): boolean;
