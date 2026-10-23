export const asrSetupPath: string;
export function inspectLocalAsr(
  config?: { pythonPath?: string; modelDirectory?: string },
  run?: (...args: any[]) => Promise<{ stdout: string }>,
): Promise<{ asrRuntimeVerified: boolean; asrModelVerified: boolean }>;
