export function downloadOrderedObjects(
  media: any,
  options: {
    signal?: AbortSignal;
    authorize: () => Promise<void>;
    fetchImpl?: typeof fetch;
  },
): Promise<Map<string, Uint8Array>>;
export function processPersonalOrderedJob(
  job: any,
  dependencies: {
    client: any;
    request: (operation: string, args: any) => Promise<any>;
    signal?: AbortSignal;
    asr?: any;
    fetchImpl?: typeof fetch;
    transcribe?: (bytes: Uint8Array, options: any) => Promise<any>;
  },
): Promise<{ completed: boolean; deferred?: boolean }>;
