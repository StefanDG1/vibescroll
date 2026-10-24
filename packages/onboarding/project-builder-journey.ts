import { z } from "zod";

export const journeyVersion = "project-builder-v1" as const;
export const instagramGuideVersion = "instagram-export-v1" as const;
export const journeyChapters = [
  "Set up your workspace",
  "Three useful skills",
  "Time to scroll",
  "Bring your first post",
  "Bring your saved posts",
  "Keep ideas coming",
] as const;
export const instagramGuideSteps = [
  {
    title: "Find account settings",
    text: "Open Instagram settings and look for Accounts Center or Meta Account. Names and entry points can vary by device and app version.",
  },
  {
    title: "Find your information controls",
    text: "Look for Your information and permissions, then Export your information. Some versions call this Download your information. If your screen differs, use Instagram's own Help.",
  },
  {
    title: "Choose your account and destination",
    text: "Select the intended Instagram profile and Export to device. This illustration does not select an account or open an export for you.",
  },
  {
    title: "Keep the export narrow",
    text: "Choose Saved when that category is available. Do not request messages or contacts for VibeScroll. If your export is broader, it stays on your device and the importer reads only supported Saved metadata.",
  },
  {
    title: "Choose compatible settings",
    text: "VibeScroll recommends All time and JSON for supported Saved metadata. Saved links are not the original videos or permission to retrieve them.",
  },
  {
    title: "Request only when you choose",
    text: "Review Instagram's export settings before requesting the download. You can complete this lesson without making a request or having an Instagram account.",
  },
  {
    title: "Come back when it is ready",
    text: "Instagram prepares the export outside VibeScroll. A request does not mean a file is ready. You can finish this guide now and return later; no inbox connection or scheduled reminder is created.",
  },
  {
    title: "Keep the downloaded archive private",
    text: "When Instagram makes the download available, save it on your device. Inspect its actual availability and expiry there. VibeScroll has not read a notification or verified that you downloaded anything.",
  },
  {
    title: "Preview Saved links locally",
    text: "Return to Save and choose the supported import option. Select your own ZIP or extracted Saved JSON/HTML. The archive stays on your device; preview recognized links before sending selected metadata.",
  },
  {
    title: "Review before importing",
    text: "Choose the links to import and inspect duplicates and unsupported items. Importing metadata, requesting analysis and receiving cited results are separate steps. You may finish this guide and do the actual import later.",
  },
] as const;

const chapter = z.number().int().min(0).max(5);
const deferred = z.enum(["project", "skills", "first_post", "following"]);
export const journeyStateSchema = z.strictObject({
  version: z.literal(journeyVersion),
  chapter,
  substep: z.number().int().min(0).max(2),
  completedChapters: z.array(chapter).max(6),
  deferred: z.array(deferred).max(4),
  instagramGuide: z.strictObject({
    version: z.literal(instagramGuideVersion),
    step: z
      .number()
      .int()
      .min(0)
      .max(instagramGuideSteps.length - 1),
    acknowledgedAt: z.number().int().nonnegative().optional(),
  }),
  exportIntent: z
    .strictObject({
      state: z.enum(["requested", "later"]),
      reportedAt: z.number().int().nonnegative(),
    })
    .optional(),
  startedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative().optional(),
});
export type ProjectBuilderJourney = z.infer<typeof journeyStateSchema>;
export const journeyActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.enum([
      "start",
      "next",
      "back",
      "defer",
      "guide_next",
      "guide_back",
      "guide_ack",
      "finish",
      "replay",
    ]),
  }),
  z.strictObject({
    type: z.literal("export_intent"),
    intent: z.enum(["requested", "later"]),
  }),
]);
export type JourneyAction = z.infer<typeof journeyActionSchema>;

function maxSubstep(chapterIndex: number) {
  return chapterIndex === 0 ? 2 : chapterIndex === 3 ? 1 : 0;
}

/** Tutorial state only. No transition grants processing, importing or installation authority. */
export function advanceJourney(
  previous: ProjectBuilderJourney | undefined,
  input: unknown,
  now: number,
): ProjectBuilderJourney {
  const action = journeyActionSchema.parse(input);
  if (!Number.isSafeInteger(now) || now < 0)
    throw Error("INVALID_INPUT: Invalid journey time.");
  if (!previous) {
    if (action.type !== "start")
      throw Error("APPROVAL_STALE: Start this guide before continuing.");
    return {
      version: journeyVersion,
      chapter: 0,
      substep: 0,
      completedChapters: [],
      deferred: [],
      instagramGuide: { version: instagramGuideVersion, step: 0 },
      startedAt: now,
      updatedAt: now,
    };
  }
  const state = journeyStateSchema.parse(previous);
  if (
    state.substep > maxSubstep(state.chapter) ||
    new Set(state.completedChapters).size !== state.completedChapters.length ||
    new Set(state.deferred).size !== state.deferred.length
  ) {
    throw Error("INVALID_INPUT: Invalid saved guide state.");
  }
  const next = structuredClone(state);
  next.updatedAt = Math.max(now, state.updatedAt + 1);
  const moveNext = () => {
    if (next.chapter === 4 && next.instagramGuide.acknowledgedAt === undefined)
      throw Error(
        "APPROVAL_STALE: Complete the export lesson and acknowledge its final step.",
      );
    if (next.substep < maxSubstep(next.chapter)) {
      next.substep++;
      return;
    }
    if (next.chapter >= 5)
      throw Error("INVALID_INPUT: Finish this guide explicitly.");
    next.completedChapters = [
      ...new Set([...next.completedChapters, next.chapter]),
    ];
    next.chapter++;
    next.substep = 0;
  };
  switch (action.type) {
    case "start":
      return state;
    case "next":
      moveNext();
      break;
    case "back":
      if (next.substep > 0) next.substep--;
      else if (next.chapter > 0) {
        next.chapter--;
        next.substep = maxSubstep(next.chapter);
      }
      break;
    case "defer": {
      const target: ProjectBuilderJourney["deferred"][number] | null =
        next.chapter === 0 && next.substep === 2
          ? "project"
          : next.chapter === 1
            ? "skills"
            : next.chapter === 3
              ? "first_post"
              : next.chapter === 5
                ? "following"
                : null;
      if (!target) throw Error("INVALID_INPUT: This lesson cannot be skipped.");
      next.deferred = [...new Set([...next.deferred, target])];
      if (next.chapter === 3) next.substep = 1;
      if (next.chapter !== 5) moveNext();
      break;
    }
    case "guide_next":
    case "guide_back":
    case "guide_ack":
      if (next.chapter !== 4)
        throw Error("INVALID_INPUT: Open the export lesson first.");
      if (action.type === "guide_ack") {
        if (next.instagramGuide.step !== instagramGuideSteps.length - 1)
          throw Error(
            "APPROVAL_STALE: Read through the final export lesson step.",
          );
        next.instagramGuide.acknowledgedAt ??= now;
      } else {
        const step =
          next.instagramGuide.step + (action.type === "guide_next" ? 1 : -1);
        if (step < 0 || step >= instagramGuideSteps.length)
          throw Error("INVALID_INPUT: Invalid lesson step.");
        next.instagramGuide.step = step;
      }
      break;
    case "export_intent":
      if (
        next.chapter !== 4 ||
        next.instagramGuide.acknowledgedAt === undefined
      )
        throw Error(
          "APPROVAL_STALE: Complete the lesson before recording an export intention.",
        );
      next.exportIntent = { state: action.intent, reportedAt: now };
      break;
    case "finish":
      if (
        next.chapter !== 5 ||
        next.instagramGuide.acknowledgedAt === undefined
      )
        throw Error(
          "APPROVAL_STALE: Complete the required guide before finishing setup.",
        );
      next.completedChapters = [...new Set([...next.completedChapters, 5])];
      next.finishedAt ??= now;
      break;
    case "replay":
      next.chapter = 0;
      next.substep = 0;
      break;
    default:
      throw Error("INVALID_INPUT: Unsupported guide action.");
  }
  return journeyStateSchema.parse(next);
}

/** Only a reviewed catalogue may supply these cards; absent inventory stays unknown. */
export type SkillRecommendation = {
  id: string;
  name: string;
  sourceUrl: string;
  publisher: string;
  purpose: string;
  fitReason: string;
  destination: "codex";
  verifiedAt: number;
  license: string;
  installed: "unknown" | "verified";
  installCommand?: string;
};
