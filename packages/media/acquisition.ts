import { PolicyError } from "../policy";
import { AcquisitionPolicyError } from "./acquisition-policy.mjs";
import {
  acquisitionPolicy as policy,
  createAcquisitionManifest,
} from "./acquisition-runtime";
import release from "../../infra/downloader.json";
export { acquisitionMessage } from "./acquisition-runtime";
export const downloaderRelease = release;
export const acquisitionManifest = createAcquisitionManifest(release.version);
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
