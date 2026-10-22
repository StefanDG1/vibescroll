import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

// Node cannot resolve the shared policies' bundler-style TypeScript imports.
// Compile the same policies used by the server, as prepare-local-media does.
let preparation;
async function loadPreparation() {
  preparation ??= compilePreparation();
  return preparation;
}
async function compilePreparation() {
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      outDir: "private/assistant-runtime",
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: "packages/runner/local-preparation.mjs",
        formats: ["es"],
        fileName: () => "local-preparation.mjs",
      },
      rollupOptions: {
        external: [
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
          "zod",
          "convex/values",
        ],
      },
    },
  });
  return import(
    pathToFileURL(resolve("private/assistant-runtime/local-preparation.mjs"))
      .href
  );
}
export async function docker(args, timeout) {
  return (await loadPreparation()).docker(args, timeout);
}
export async function prepareLocalUrl(args) {
  return (await loadPreparation()).prepareLocalUrl(args);
}
export async function loadAssistantRuntime() {
  await loadPreparation();
  // Keep native modules at their source paths. In particular, offline Whisper
  // resolves its Python entry point relative to local-asr.mjs via import.meta.url.
  return import("./assistant-local.mjs");
}
