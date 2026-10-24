"use node";
import type { ActionCtx } from "../_generated/server";
import type { ProjectSourceImage } from "./projectSourceContent";
import { loadProjectSourceImage } from "../../packages/providers/project-source-images";
import { ensure } from "../../packages/policy";
import { infer } from "./inference";
import { inferGoogle } from "./googleInference";

export async function inferProject(
  ctx: ActionCtx,
  schema: Record<string, unknown>,
  prompt: string,
  input: unknown,
  maxOutput: number,
  sourceContent: { images: ProjectSourceImage[] } | undefined,
  authorize: (image?: ProjectSourceImage) => Promise<void>,
  onDispatch: () => void,
) {
  const images = sourceContent?.images ?? [];
  if (!images.length) {
    await authorize();
    onDispatch();
    return infer(ctx, schema, prompt, input, maxOutput);
  }
  ensure(
    process.env.MANAGED_INFERENCE_ROUTE === "google_metered",
    "SETUP_REQUIRED",
    "The selected managed route cannot inspect images. Choose your supported subscription route or turn off full source content. No provider fallback was used.",
  );
  ensure(
    images.length <= 32 &&
      images.reduce((sum, image) => sum + 4 * Math.ceil(image.size / 3), 0) +
        JSON.stringify(input).length +
        JSON.stringify(schema).length +
        prompt.length <
        3800000,
    "PROVIDER_LIMIT",
    "The full source exceeds this managed route's image limit. Choose your subscription route or turn off full source content; nothing was silently omitted.",
  );
  const parts: (
    { text: string } | { inlineData: { mimeType: "image/jpeg"; data: string } }
  )[] = [{ text: JSON.stringify(input) }];
  for (const image of images) {
    await authorize(image);
    const loaded = await loadProjectSourceImage(image);
    parts.push({
      inlineData: { mimeType: loaded.mimeType, data: loaded.data },
    });
  }
  await authorize();
  onDispatch();
  return inferGoogle(ctx, {
    schema,
    prompt,
    parts,
    maxOutput,
    maxMicros: 100000,
  });
}
