import { PolicyError } from "../policy";
import { AcquisitionPolicyError } from "./acquisition-policy.mjs";
import { acquisitionPolicy as policy } from "./acquisition-runtime.ts";
export {
  downloaderRelease,
  acquisitionManifest,
  acquisitionMessage,
} from "./acquisition-runtime.ts";
// Keep Convex's public error adapter out of the local companion module graph.
export function acquisitionPolicy(raw: string) {
  try {
    return policy(raw);
  } catch (error) {
    if (error instanceof AcquisitionPolicyError)
      throw new PolicyError(error.code, error.detail);
    throw error;
  }
}
