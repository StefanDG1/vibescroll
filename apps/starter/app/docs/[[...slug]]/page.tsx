import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DocsPage,
  DocsTitle,
  DocsDescription,
  DocsBody,
} from "fumadocs-ui/page";
import { safeHelpUrl } from "@/lib/safe-document-url";
import {
  developerPages,
  developerPage,
  readDeveloperPage,
  docsUrl,
  docsToc,
  docsHeadingId,
  mcpTools,
} from "@/lib/developer-docs";
import { McpDiagram } from "@/components/mcp-diagram";
import { McpToolReference } from "@/components/mcp-tool-reference";
import checkedExamples from "../../../../../docs/developers/examples.json";

export const dynamicParams = false;
export function generateStaticParams() {
  return developerPages.map(({ slug }) => ({
    slug: slug ? slug.split("/") : [],
  }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const page = developerPage(slug.join("/"));
  if (!page) notFound();
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: `https://scroll.companynerve.com${docsUrl(page.slug)}`,
    },
  };
}

export default async function DocumentationPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const result = await readDeveloperPage(slug.join("/"));
  if (!result) notFound();
  const { page, text } = result;
  return (
    <DocsPage
      toc={[
        ...docsToc(text),
        ...(page.slug === "mcp/results"
          ? [
              {
                title: "Checked output examples",
                url: "#checked-output-examples",
                depth: 2,
              },
            ]
          : []),
      ]}
    >
      <span id="main" tabIndex={-1} className="sr-only">
        Documentation content
      </span>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      {page.diagram && <McpDiagram kind={page.diagram} />}
      <DocsBody>
        <Markdown
          skipHtml
          remarkPlugins={[remarkGfm]}
          urlTransform={safeHelpUrl}
          components={{
            a: ({ href, children }) =>
              href ? (
                <Link href={href}>{children}</Link>
              ) : (
                <span>{children}</span>
              ),
            h2: ({ children }) => (
              <h2 id={docsHeadingId(String(children))}>{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 id={docsHeadingId(String(children))}>{children}</h3>
            ),
          }}
        >
          {text}
        </Markdown>
        {page.slug === "mcp/tools" && <McpToolReference tools={mcpTools} />}
        {page.slug === "mcp/results" && (
          <section
            aria-label="Checked synthetic output examples"
            className="mcp-reference"
          >
            <h2 id="checked-output-examples">Checked output examples</h2>
            <p>{checkedExamples.notice}</p>
            {(
              [
                ["profile_summary", "Workspace discovery"],
                ["fetchStructured", "Structured insights"],
                ["proposalSave", "Saved proposal and continuation"],
                ["preparedStatus", "Processing and credit state"],
              ] as const
            ).map(([key, title]) => (
              <details key={key}>
                <summary>{title}</summary>
                <div>
                  <pre>
                    <code>
                      {JSON.stringify(checkedExamples.examples[key], null, 2)}
                    </code>
                  </pre>
                </div>
              </details>
            ))}
          </section>
        )}
        <p className="docs-reviewed">
          Source audit: November 1, 2026.{" "}
          <a href="https://github.com/StefanDG1/vibescroll/tree/codex/launch-20261022-link-cloud-compatible-20261025/docs/developers">
            View documentation source
          </a>
          .
        </p>
      </DocsBody>
    </DocsPage>
  );
}
