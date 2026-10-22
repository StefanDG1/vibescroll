export type CompanionCheck = {
  id: string;
  status: "passed" | "blocked" | "unknown";
  repair?: string;
};
export type CompanionReport = {
  version: number;
  kind: string;
  readyForLocalStart: boolean;
  readyToConnect: boolean;
  processingReady: string;
  checks: CompanionCheck[];
  limits: string[];
};
export function companionPreflight(observed: {
  config?: Record<string, unknown>;
  platform?: string;
  nodeVersion?: string;
  dockerLinux?: boolean;
  dockerEndpointLocal?: boolean;
  mediaImagePresent?: boolean;
  codexImagePinned?: boolean;
  codexImagePresent?: boolean;
  pythonPresent?: boolean;
  asrModelPresent?: boolean;
  savedConnectionPresent?: boolean;
  freeBytes?: number;
}): CompanionReport;
export function startupLauncher(paths: {
  executable: string;
  script: string;
  config: string;
  root: string;
}): string;
