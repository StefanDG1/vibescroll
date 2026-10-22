export function assertLocalDockerEndpoint(
  endpoint: string,
  override?: string,
): void;
export function controllerAnnouncement(): {
  push(chunk: Uint8Array | string): void;
  accepts(session: any, startedAt: number, now?: number): boolean;
};
export function createRunnerRequest(options: {
  server: string;
  credential: string;
  route: "personal" | "assistant";
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): (operation: string, args?: any) => Promise<any>;
export function createSubscriptionCoordinator(options: {
  official: any;
  personal: any;
  requestPersonal: (operation: string, args?: any) => Promise<any>;
  requestAssistant: (operation: string, args?: any) => Promise<any>;
  processPersonal: (job: any, dependencies: any) => Promise<any>;
  processAssistant: (job: any, dependencies: any) => Promise<any>;
  config: any;
  signal: AbortSignal;
  now?: () => number;
  onStatus?: (status: {
    route: "personal" | "assistant";
    state: "completed" | "failed" | "unavailable";
    mediaStatus?: string;
  }) => void;
}): {
  step(): Promise<{
    worked: boolean;
    route?: "personal" | "assistant";
    rotate?: boolean;
    delayMs: number;
  }>;
};
