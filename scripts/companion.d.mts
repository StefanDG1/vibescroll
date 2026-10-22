import type { CompanionReport } from "../packages/runner/companion-preflight.mjs";
export function inspectCompanion(configPath: string): Promise<CompanionReport>;
export function companionCommand(args: string[]): Promise<any>;
