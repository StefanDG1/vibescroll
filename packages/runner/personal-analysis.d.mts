import type { SubscriptionCapabilities } from "./subscription-capabilities.mjs";
export class OfficialPersonalClient {
  constructor(official: any);
  status(): Promise<{ profileBinding: string }>;
  models(): Promise<{ slug: string; displayName: string }[]>;
  capabilities(): Promise<SubscriptionCapabilities>;
  respond(options: any): Promise<{ text: string }>;
  preflight(options: {
    model: string;
    effort: string;
    needsAudio: boolean;
    asr?: any;
    signal?: AbortSignal;
  }): Promise<{
    profileBinding: string;
    capabilities: SubscriptionCapabilities;
    localAsrReady: boolean;
  }>;
}
export function processPersonalJob(
  job: any,
  dependencies: {
    client: {
      respond: (options: any) => Promise<any>;
      status: () => Promise<any>;
      capabilities?: () => Promise<SubscriptionCapabilities>;
      preflight?: (options: any) => Promise<any>;
    };
    request: (operation: string, args: any) => Promise<any>;
    signal?: AbortSignal;
    asr?: { pythonPath: string; modelDirectory: string };
    prepareInput?: (media: any, options: any) => Promise<any>;
    fetchImpl?: typeof fetch;
    transcribe?: (bytes: Uint8Array, options: any) => Promise<any>;
  },
): Promise<{ completed: boolean; deferred?: boolean }>;
