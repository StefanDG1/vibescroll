import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import registry from "../docs/developers/mcp-tools.generated.json";
import {
  guideForTool,
  toolGroups,
  toolGuide,
} from "../packages/mcp/tool-guide";

it("assigns every real discovered tool exactly one primary reference group", () => {
  const names = registry.tools.map((tool) => tool.name);
  expect(names).toHaveLength(54);
  expect(new Set(names).size).toBe(names.length);
  expect(Object.keys(toolGuide).sort()).toEqual([...names].sort());
  expect(new Set(toolGroups.map((group) => group.id)).size).toBe(
    toolGroups.length,
  );
  expect(toolGroups.map((group) => group.audience)).toEqual([
    ...Array(9).fill("general"),
    "worker",
    "embedded",
  ]);
  for (const name of names) {
    const guide = guideForTool(name)!;
    expect(toolGroups.filter((group) => group.id === guide.group)).toHaveLength(
      1,
    );
  }
  for (const group of toolGroups) {
    expect(
      Object.values(toolGuide).some((guide) => guide.group === group.id),
    ).toBe(true);
  }
});

it("uses real packaged skill tags and supported public workflow destinations", () => {
  const packaged = readdirSync("plugins/vibescroll/skills", {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const source = readFileSync(
        `plugins/vibescroll/skills/${entry.name}/SKILL.md`,
        "utf8",
      );
      expect(source).toMatch(new RegExp(`^name: ${entry.name}$`, "m"));
      return entry.name;
    });
  expect(packaged).toHaveLength(9);
  const used = new Set<string>();
  for (const guide of Object.values(toolGuide)) {
    expect(guide.skills.length).toBeGreaterThan(0);
    expect(new Set(guide.skills).size).toBe(guide.skills.length);
    for (const skill of guide.skills) {
      expect(packaged).toContain(skill);
      used.add(skill);
    }
    expect(guide.flow).toMatch(
      /^\/docs\/(?:workflows\/(?:find-save|analyze|reanalyze|proposals|discussion|handoff)|mcp\/(?:first-workflow|skills))$/,
    );
    expect(guide.purpose.trim().length).toBeGreaterThan(0);
    expect(guide.result.trim().length).toBeGreaterThan(0);
    expect([
      "no_ai",
      "quote",
      "credits",
      "host_worker",
      "conditional",
    ]).toContain(guide.funding);
    expect(guide).not.toHaveProperty("inputSchema");
    expect(guide).not.toHaveProperty("securitySchemes");
    expect(guide).not.toHaveProperty("annotations");
  }
  expect([...used].sort()).toEqual([...packaged].sort());
});

it("returns no guide for unknown or inherited property names", () => {
  expect(guideForTool("get_profile")).toBe(toolGuide.get_profile);
  for (const name of [
    "unknown_tool",
    "toString",
    "__proto__",
    "constructor",
    "",
  ]) {
    expect(guideForTool(name)).toBeUndefined();
  }
});
