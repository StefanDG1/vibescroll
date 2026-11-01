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
    <DocsPage toc={docsToc(text)}>
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
        {page.slug === "mcp/tools" && (
          <section
            aria-label="Generated MCP tool descriptors"
            className="mcp-reference"
          >
            <p>
              {mcpTools.length} descriptors from the full feature-enabled
              registry. Expand a tool for its exact contract.
            </p>
            {mcpTools.map((tool) => (
              <details key={tool.name} id={tool.name}>
                <summary>
                  <code>{tool.name}</code>
                  <span>
                    {tool.annotations.readOnlyHint ? "Read" : "Action"}
                  </span>
                </summary>
                <div>
                  <p>{tool.description}</p>
                  <h3>OAuth scopes</h3>
                  <p>
                    {tool.securitySchemes
                      .flatMap((scheme) => scheme.scopes)
                      .map((scope) => (
                        <code key={scope}>{scope} </code>
                      ))}
                  </p>
                  <h3>Input schema</h3>
                  <pre>
                    <code>{JSON.stringify(tool.inputSchema, null, 2)}</code>
                  </pre>
                  <h3>Annotations</h3>
                  <pre>
                    <code>{JSON.stringify(tool.annotations, null, 2)}</code>
                  </pre>
                  <p>
                    <Link href="/docs/mcp/results">
                      Read result meanings and limits
                    </Link>
                  </p>
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
