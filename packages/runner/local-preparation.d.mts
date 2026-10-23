export function workerFlags(
  image: string,
  name: string,
  volume: string,
  socket: string,
): string[];
export function localPreparationCleanupCommand(directory: string): {
  executable: string;
  args: string[];
};
export function prepareLocalUrl(options: {
  url: string;
  sourceId: string;
  image: string;
  privateRoot: string;
  run?: (
    args: string[],
    timeout?: number,
    signal?: AbortSignal,
  ) => Promise<string>;
  scheduleCleanup?: (directory: string) => Promise<void>;
  signal?: AbortSignal;
}): Promise<{
  sourceId: string;
  status: string;
  directory: string;
  computeCredits: number;
  frames?: number;
  audio?: boolean;
}>;
