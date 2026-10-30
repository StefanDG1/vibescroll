import { expect, it } from "vitest";
import { suggestProjects } from "../apps/starter/lib/project-suggestions";
const project = {
  _id: "p1",
  fullName: "owned/example",
  enabled: true,
  confirmed: true,
  status: "connected",
  profile: "purpose: A marketing analytics product",
};
it("uses confirmed topic/context overlap without changing the inputs or copying context", () => {
  const source = { categoryKeys: ["marketing"], analysisVersion: { id: "v1" } };
  const before = JSON.stringify([source, project]);
  expect(suggestProjects(source, [project])).toEqual({
    versionId: "v1",
    items: [
      {
        id: "p1",
        name: "owned/example",
        topics: ["marketing"],
        fit: {
          rubric: "topic-coverage-v1",
          matched: 1,
          total: 1,
          criteria: [
            { category: "marketing", matched: true, terms: ["marketing"] },
          ],
        },
      },
    ],
  });
  expect(JSON.stringify([source, project])).toBe(before);
});
it("reports missing topic matches without a favorable baseline or invented history", () => {
  const result = suggestProjects(
    { categoryKeys: ["marketing", "coding", "coding"] },
    [project],
  );
  expect(result.items[0].fit).toEqual({
    rubric: "topic-coverage-v1",
    matched: 1,
    total: 2,
    criteria: [
      { category: "marketing", matched: true, terms: ["marketing"] },
      { category: "coding", matched: false, terms: [] },
    ],
  });
  expect(
    suggestProjects({ categoryKeys: ["coding"] }, [project]).items,
  ).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/history|probability|success/);
});
it("does not recommend unconfirmed, disabled or disconnected projects, or match a non-goal", () => {
  expect(
    suggestProjects({ categoryKeys: ["marketing"] }, [
      { ...project, confirmed: false },
      { ...project, enabled: false },
      { ...project, status: "preparing" },
      {
        ...project,
        profile:
          "purpose: A mathematics practice tool\n\nnonGoals: No marketing campaigns or advertising.",
      },
    ]).items,
  ).toEqual([]);
});
it("has stable bounded ordering and does not mistake updatedAt for meaningful activity", () => {
  const projects = Array.from({ length: 6 }, (_, i) => ({
    ...project,
    _id: `p${i}`,
    fullName: `owned/${i}`,
    updatedAt: 999 - i,
  }));
  const source = {
    analysis: {
      insights: [{ title: "Advertising creative", claim: "Review a campaign" }],
    },
  };
  const first = suggestProjects(source, projects);
  expect(first.items).toHaveLength(3);
  expect(suggestProjects(source, [...projects].reverse())).toEqual(first);
  expect(first.items[0].name).toBe("owned/0");
});
