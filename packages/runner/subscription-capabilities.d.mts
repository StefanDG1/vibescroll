export type SubscriptionCapabilities = {
  schemaVersion: "1.0.0";
  catalogueSource: "official_app_server";
  access: "advertised_not_verified";
  models: {
    slug: string;
    displayName: string;
    reasoningEfforts: string[];
    defaultReasoningEffort: string | null;
    inputModalities: ("text" | "image")[];
    modalitySource: "advertised" | "protocol_default";
  }[];
  localLimits: {
    maxInputTextBytes: 1000000;
    maxInlineFrames: 48;
    maxFrameBytes: 1000000;
    maxAggregateFrameBytes: 12000000;
    maxOutputBytes: 120000;
  };
};
export const subscriptionInputLimits: Readonly<
  SubscriptionCapabilities["localLimits"]
>;
export function safeModel(value: unknown): value is string;
export function safeEffort(value: unknown): value is string;
export function normalizeSubscriptionCapabilities(
  catalogue: unknown,
): SubscriptionCapabilities;
export function readSubscriptionCapabilities(
  server: any,
): Promise<SubscriptionCapabilities>;
export function assertSubscriptionInput(
  capabilities: SubscriptionCapabilities,
  model: string,
  effort: string,
  input: unknown,
  frames: string[],
): void;
