import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { Header } from "@/components/header";
import { Card } from "@companynerve/ui";
import { neutralCloudAnalysis } from "../../../../../../../packages/contracts/cloud-catalog";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const post = await (
    await backend()
  ).mutation(api.catalogBrowse.detail, {
    organizationId: org as Id<"organizations">,
    familyId: id as Id<"catalogFamilies">,
  });
  const analysis = neutralCloudAnalysis.parse(post.analysis);
  return (
    <div className="account-page">
      <Header />
      <main id="main">
        <a href={`/app/${org}/catalog`}>Shared library</a>
        <h1>{post.title}</h1>
        {post.authorName && <p>{post.authorName}</p>}
        <a href={post.canonical} target="_blank" rel="noreferrer">
          Original post
        </a>
        <p>{analysis.summary}</p>
        {analysis.warnings.map((warning, i) => (
          <p key={i} className="muted">
            {warning}
          </p>
        ))}
        <div className="stack">
          {analysis.insights.map((insight) => (
            <Card key={insight.id}>
              <h2>{insight.title}</h2>
              <p>{insight.claim}</p>
              {insight.interpretation && <p>{insight.interpretation}</p>}
              <p className="muted">
                Evidence:{" "}
                {insight.evidence
                  .map((ref) =>
                    ref.startMs === null
                      ? ref.id
                      : `${(ref.startMs / 1000).toFixed(1)}s`,
                  )
                  .join(", ")}
              </p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
