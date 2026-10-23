import type { SubscriptionCapabilities } from "./subscription-capabilities.mjs";
export class OfficialPersonalClient {
  constructor(official: any);
  status(): Promise<{ profileBinding: string }>;
  models(): Promise<{ slug: string; displayName: string }[]>;
  capabilities(): Promise<SubscriptionCapabilities>;
  respond(options: any): Promise<{ text: string }>;
}
export function processPersonalJob(
  job: any,
  dependencies: {
    client: {
      respond: (options: any) => Promise<any>;
      status: () => Promise<any>;
      capabilities?: () => Promise<SubscriptionCapabilities>;
    };
    request: (operation: string, args: any) => Promise<any>;
    signal?: AbortSignal;
    asr?: { pythonPath: string; modelDirectory: string };
    prepareInput?: (media: any, options: any) => Promise<any>;
  },
): Promise<{ completed: boolean }>;
