export function checkOrderedAsr(
  asr: { pythonPath: string; modelDirectory: string } | undefined,
  signal?: AbortSignal,
  transcribe?: (bytes: Uint8Array, options: any) => Promise<any>,
): Promise<true>;
