export function hash(value: unknown): string;
export function idleDelay(empty: number): number;
export function strictSchema(value: any): any;
export const localWhisperPath: string;
export class OfficialAssistantClient {
  constructor(session: any, server: any);
  session: any;
  server: any;
  static connect(session: any): Promise<OfficialAssistantClient>;
  check(): Promise<void>;
  structured(
    schema: any,
    input: any,
    frames?: string[],
    options?: {
      model?: string;
      effort?: "low" | "medium" | "high";
      signal?: AbortSignal;
    },
  ): Promise<{ output: any; inputHash: string; outputHash: string }>;
  close(): void;
}
export function processAssistantJob(job: any, dependencies: any): Promise<any>;
