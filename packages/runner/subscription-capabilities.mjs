import { canonicalJson } from "../contracts/canonical-json.mjs";

// These are adapter safety limits, not model context or account entitlements.
export const subscriptionInputLimits = Object.freeze({
  maxInputTextBytes: 1000000,
  maxInlineFrames: 48,
  maxFrameBytes: 1000000,
  maxAggregateFrameBytes: 12000000,
  maxOutputBytes: 120000,
});
export const safeModel = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
export const safeEffort = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(value);

export function normalizeSubscriptionCapabilities(catalogue) {
  if (!Array.isArray(catalogue?.data) || catalogue.data.length > 500)
    throw Error("ASSISTANT_LOCAL_CAPABILITIES_INVALID");
  const models = new Map(),
    conflicts = new Set();
  for (const entry of catalogue.data) {
    if (!entry || entry.hidden === true) continue;
    const slug = entry.model ?? entry.id;
    if (!safeModel(slug)) continue;
    const displayName = entry.displayName ?? slug;
    const efforts = entry.supportedReasoningEfforts;
    // The pinned ModelListResponse defines this exact omitted-field default.
    const modalities =
      entry.inputModalities === undefined
        ? ["text", "image"]
        : entry.inputModalities;
    if (
      typeof displayName !== "string" ||
      !displayName.trim() ||
      displayName.length > 120 ||
      [...displayName].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      !Array.isArray(efforts) ||
      !efforts.length ||
      efforts.length > 32 ||
      efforts.some((level) => !safeEffort(level?.reasoningEffort)) ||
      !Array.isArray(modalities) ||
      modalities.length > 2 ||
      modalities.some((kind) => !["text", "image"].includes(kind)) ||
      !modalities.includes("text")
    ) {
      conflicts.add(slug);
      continue;
    }
    const reasoningEfforts = [
      ...new Set(efforts.map((e) => e.reasoningEffort)),
    ];
    const defaultReasoningEffort = entry.defaultReasoningEffort ?? null;
    if (
      defaultReasoningEffort !== null &&
      !reasoningEfforts.includes(defaultReasoningEffort)
    ) {
      conflicts.add(slug);
      continue;
    }
    const model = {
      slug,
      displayName,
      reasoningEfforts,
      defaultReasoningEffort,
      inputModalities: ["text", "image"].filter((kind) =>
        modalities.includes(kind),
      ),
      modalitySource:
        entry.inputModalities === undefined ? "protocol_default" : "advertised",
    };
    if (
      models.has(slug) &&
      canonicalJson(models.get(slug)) !== canonicalJson(model)
    )
      conflicts.add(slug);
    else models.set(slug, model);
  }
  return {
    schemaVersion: "1.0.0",
    catalogueSource: "official_app_server",
    access: "advertised_not_verified",
    models: [...models.values()]
      .filter((m) => !conflicts.has(m.slug))
      .slice(0, 50),
    localLimits: { ...subscriptionInputLimits },
  };
}

export async function readSubscriptionCapabilities(server) {
  let page = await server.models();
  const data = [],
    cursors = new Set();
  for (let count = 0; count < 5; count++) {
    if (!Array.isArray(page?.data) || page.data.length > 500 - data.length)
      throw Error("ASSISTANT_LOCAL_CAPABILITIES_INVALID");
    data.push(...page.data);
    if (page.nextCursor === undefined || page.nextCursor === null)
      return normalizeSubscriptionCapabilities({ data });
    if (
      typeof page.nextCursor !== "string" ||
      !page.nextCursor.length ||
      page.nextCursor.length > 2000 ||
      cursors.has(page.nextCursor) ||
      count === 4
    )
      throw Error("ASSISTANT_LOCAL_CAPABILITIES_INVALID");
    cursors.add(page.nextCursor);
    page = await server.request("model/list", {
      includeHidden: false,
      cursor: page.nextCursor,
      limit: 100,
    });
  }
  throw Error("ASSISTANT_LOCAL_CAPABILITIES_INVALID");
}

export function assertSubscriptionInput(
  capabilities,
  model,
  effort,
  input,
  frames,
) {
  const selected = capabilities.models.find((m) => m.slug === model);
  if (
    !safeModel(model) ||
    !safeEffort(effort) ||
    !selected?.reasoningEfforts.includes(effort)
  )
    throw Error("ASSISTANT_LOCAL_MODEL_UNAVAILABLE");
  if (
    !Array.isArray(frames) ||
    frames.length > subscriptionInputLimits.maxInlineFrames ||
    Buffer.byteLength(canonicalJson(input)) >
      subscriptionInputLimits.maxInputTextBytes
  )
    throw Error("ASSISTANT_LOCAL_INPUT_LIMIT");
  if (frames.length && !selected.inputModalities.includes("image"))
    throw Error("ASSISTANT_LOCAL_MODALITY_UNAVAILABLE");
  let total = 0;
  for (const frame of frames) {
    if (
      typeof frame !== "string" ||
      frame.length > 1333359 ||
      !frame.startsWith("data:image/jpeg;base64,") ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(frame.slice(23))
    )
      throw Error("ASSISTANT_LOCAL_INPUT_LIMIT");
    const bytes = Buffer.from(frame.slice(23), "base64");
    total += bytes.length;
    if (
      !bytes.length ||
      bytes.length > subscriptionInputLimits.maxFrameBytes ||
      total > subscriptionInputLimits.maxAggregateFrameBytes ||
      bytes.toString("base64") !== frame.slice(23)
    )
      throw Error("ASSISTANT_LOCAL_INPUT_LIMIT");
  }
}
