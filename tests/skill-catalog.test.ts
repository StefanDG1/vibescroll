import { expect, it } from "vitest";
import { recommendProjectSkills } from "../packages/onboarding/skill-catalog";
it("matches reviewed skills locally without inventing relevant or installed recommendations", () => {
  expect(recommendProjectSkills([])).toMatchObject({
    status: "needs_context",
    recommendations: [],
  });
  expect(
    recommendProjectSkills(["Maintain a Rust command-line parser"]),
  ).toMatchObject({ status: "unavailable", recommendations: [] });
  const web = recommendProjectSkills(["Improve my React web app"]);
  expect(web.status).toBe("ready");
  expect(web.recommendations).toHaveLength(3);
  for (const item of web.recommendations) {
    expect(item.sourceUrl).toMatch(
      /^https:\/\/github.com\/(vercel-labs\/agent-skills|openai\/skills)\/blob\/[a-f0-9]{40}\//,
    );
    expect(item.installed).toBe("unknown");
    expect(item.destination).toBe("codex");
    expect(item).not.toHaveProperty("installCommand");
    expect(["MIT", "Apache-2.0"]).toContain(item.license);
  }
  expect(
    recommendProjectSkills(["Browser testing"]).recommendations,
  ).toHaveLength(1);
});
