// Preparation policies have a native, dependency-bounded module graph.
// Keep Whisper relative to its source module and avoid runtime compilation.
export { docker, prepareLocalUrl } from "./local-preparation.mjs";
export async function loadAssistantRuntime() {
  return import("./assistant-local.mjs");
}
