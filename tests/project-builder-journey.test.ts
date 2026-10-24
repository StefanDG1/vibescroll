import { describe, expect, it } from "vitest";
import {
  advanceJourney,
  instagramGuideSteps,
  type ProjectBuilderJourney,
} from "../packages/onboarding/project-builder-journey";

const next = (state: ProjectBuilderJourney, type: string) =>
  advanceJourney(state, { type }, state.updatedAt + 1);
function atExportLesson() {
  let state = advanceJourney(undefined, { type: "start" }, 100);
  state = next(state, "next"); // existing context -> processing
  state = next(state, "next"); // processing -> optional project
  state = next(state, "defer"); // project -> skills
  state = next(state, "defer"); // skills -> scroll
  state = next(state, "next"); // scroll -> sharing
  state = next(state, "defer"); // first post pending -> required lesson
  return state;
}
describe("saved project-builder education", () => {
  it("permits optional project, skills and pending work without skipping required education", () => {
    const state = atExportLesson();
    expect(state.chapter).toBe(4);
    expect(state.deferred).toEqual(["project", "skills", "first_post"]);
    for (const type of ["next", "defer", "guide_ack", "finish"])
      expect(() => next(state, type)).toThrow();
    expect(state.instagramGuide.acknowledgedAt).toBeUndefined();
    expect(state.exportIntent).toBeUndefined();
  });
  it("resumes exact lesson progress after serialization and completes with no archive, request, account or processing claim", () => {
    let state = atExportLesson();
    for (let step = 1; step < instagramGuideSteps.length; step++) {
      state = next(state, "guide_next");
      state = JSON.parse(JSON.stringify(state));
      expect(state.instagramGuide.step).toBe(step);
    }
    state = next(state, "guide_ack");
    expect(state.exportIntent).toBeUndefined();
    state = next(state, "next");
    state = next(state, "defer");
    state = next(state, "finish");
    expect(state.finishedAt).toBeDefined();
    expect(state.deferred).toContain("following");
    expect(Object.keys(state).sort()).toEqual(
      [
        "version",
        "chapter",
        "substep",
        "completedChapters",
        "deferred",
        "instagramGuide",
        "startedAt",
        "updatedAt",
        "finishedAt",
      ].sort(),
    );
    const replay = next(state, "replay");
    expect(replay.finishedAt).toBe(state.finishedAt);
    expect(replay.instagramGuide).toEqual(state.instagramGuide);
    expect(replay.chapter).toBe(0);
  });
  it("records export intent separately and preserves it through back/replay without fabricating an import", () => {
    let state = atExportLesson();
    expect(() =>
      advanceJourney(
        state,
        { type: "export_intent", intent: "requested" },
        200,
      ),
    ).toThrow();
    for (let step = 1; step < instagramGuideSteps.length; step++)
      state = next(state, "guide_next");
    state = next(state, "guide_ack");
    state = advanceJourney(
      state,
      { type: "export_intent", intent: "requested" },
      300,
    );
    const previous = next(state, "back");
    expect(previous.exportIntent).toEqual({
      state: "requested",
      reportedAt: 300,
    });
    expect(previous.instagramGuide.acknowledgedAt).toBe(
      state.instagramGuide.acknowledgedAt,
    );
    expect(JSON.stringify(previous)).not.toMatch(
      /importCommitted|analysesReady|installed|connected/,
    );
  });
  it("rejects arbitrary jumps, forged timestamps/acknowledgements, old/new version confusion and nonoptional deferral", () => {
    const state = advanceJourney(undefined, { type: "start" }, 100);
    for (const input of [
      { type: "next", chapter: 5 },
      { type: "guide_ack", acknowledgedAt: 1 },
      { type: "start", finishedAt: 1 },
      { type: "export_intent", intent: "downloaded" },
      { type: "defer" },
      { type: "guide_next" },
      { type: "finish" },
    ])
      expect(() => advanceJourney(state, input, 200)).toThrow();
    expect(() => advanceJourney(undefined, { type: "next" }, 100)).toThrow();
    expect(() =>
      advanceJourney(
        {
          ...state,
          version: "future-guide",
        } as unknown as ProjectBuilderJourney,
        { type: "start" },
        200,
      ),
    ).toThrow();
    expect(() => advanceJourney(state, { type: "next" }, Number.NaN)).toThrow();
  });
});
