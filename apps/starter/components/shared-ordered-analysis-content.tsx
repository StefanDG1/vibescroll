import type { SharedOrderedAnalysis } from "@/lib/shared-ordered-analysis-display";
import { publicCitationUrl } from "@/lib/public-knowledge-display";

export function SharedOrderedAnalysisContent({
  analysis,
}: {
  analysis: SharedOrderedAnalysis;
}) {
  const source = publicCitationUrl(analysis.sourceUrl);
  return (
    <article className="public-edition-content">
      <h2>{analysis.title}</h2>
      <p>
        AI-generated analysis may contain errors. Review the source and
        inspected evidence before relying on it. Saving this shared analysis
        does not start a new analysis.
      </p>
      <p>{analysis.summary}</p>
      <p>
        Ordered media. {analysis.inspectedAssetCount} assets inspected.
        {analysis.expectedAssetCount === null
          ? " The total asset count is unknown."
          : ` The recorded total is ${analysis.expectedAssetCount}.`}
        {analysis.acquisitionCoverage !== "complete_manifest" &&
          " Complete source coverage has not been established."}{" "}
        Language: {analysis.language}.
      </p>
      {source && (
        <p>
          <a href={source} rel="noreferrer">
            Open the original post
          </a>
        </p>
      )}
      {analysis.warnings.length > 0 && (
        <ul>
          {analysis.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
      {analysis.insights.map((insight) => (
        <section className="example-evidence" key={insight.id}>
          <h3>{insight.title}</h3>
          <p>{insight.claim}</p>
          <p>{insight.interpretation}</p>
          <p>Evidence confidence: {insight.confidence}.</p>
          <h4>Evidence references</h4>
          <ul>
            {insight.citations.map((citation) => {
              const href = publicCitationUrl(citation.url);
              return (
                <li key={`${citation.kind}:${citation.id}`}>
                  {href ? (
                    <a href={href} rel="noreferrer">
                      {citation.label}
                    </a>
                  ) : (
                    <span>{citation.label}</span>
                  )}{" "}
                  Asset {citation.assetIndex + 1}, {citation.basis}.
                  {citation.kind === "image_observation"
                    ? " Untimed image reference."
                    : ` ${citation.startMs! / 1000}–${citation.endMs! / 1000}s.`}
                  {citation.crop &&
                    ` Crop: x ${citation.crop.x}, y ${citation.crop.y}, width ${citation.crop.width}, height ${citation.crop.height} of the original image.`}
                  {citation.uncertainty &&
                    ` Uncertainty: ${citation.uncertainty}`}
                </li>
              );
            })}
          </ul>
          {insight.uncertainty.length > 0 && (
            <>
              <h4>Uncertainty</h4>
              <ul>
                {insight.uncertainty.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </article>
  );
}
