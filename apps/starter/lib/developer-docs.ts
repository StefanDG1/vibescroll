import type { Root } from "fumadocs-core/page-tree";
import manifest from "../../../docs/developers/manifest.json";
import registry from "../../../docs/developers/mcp-tools.generated.json";
import content from "../../../docs/developers/content.generated.json";
import { guideForTool, toolGroups } from "../../../packages/mcp/tool-guide";

export const developerPages = manifest.pages;
export const mcpTools = registry.tools;
export const docsUrl = (slug: string) => `/docs${slug ? `/${slug}` : ""}`;
export const developerPage = (slug: string) =>
  developerPages.find((page) => page.slug === slug);

export async function readDeveloperPage(slug: string) {
  const page = developerPage(slug);
  if (!page || !/^[a-z][a-z-]*\.md$/.test(page.file)) return null;
  const text = (content as Record<string, string>)[page.file];
  if (!text) return null;
  return { page, text };
}

export function docsHeadingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
export function docsToc(text: string) {
  let fenced = false;
  return text.split("\n").flatMap((line) => {
    if (line.startsWith("```")) fenced = !fenced;
    const heading = !fenced && /^(#{2,3}) (.+)$/.exec(line);
    return heading
      ? [
          {
            title: heading[2],
            url: `#${docsHeadingId(heading[2])}`,
            depth: heading[1].length,
          },
        ]
      : [];
  });
}

export const developerTree: Root = {
  name: "VibeScroll developers",
  children: [...new Set(developerPages.map((page) => page.group))].flatMap(
    (group) => [
      { type: "separator" as const, name: group },
      ...developerPages
        .filter((page) => page.group === group)
        .map((page) => ({
          type: "page" as const,
          name: page.title,
          url: docsUrl(page.slug),
        })),
    ],
  ),
};

export async function developerSearchIndexes() {
  const pages = await Promise.all(
    developerPages.map(async (page) => {
      const result = await readDeveloperPage(page.slug);
      return {
        title: page.title,
        description: page.description,
        content: result?.text ?? "",
        url: docsUrl(page.slug),
      };
    }),
  );
  return [
    ...pages,
    ...mcpTools.map((tool) => ({
      title: tool.name,
      description: tool.description,
      content: `${tool.description}\n${JSON.stringify(tool.inputSchema)}\n${JSON.stringify(tool.securitySchemes)}\n${JSON.stringify(guideForTool(tool.name))}\n${toolGroups.find((group) => group.id === guideForTool(tool.name)?.group)?.title ?? ""}`,
      url: `/docs/mcp/tools#${tool.name}`,
    })),
  ];
}
