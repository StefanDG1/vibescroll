import {
  publicCitationUrl,
  type PublicPayload,
} from "@/lib/public-knowledge-display";
export function PublicEditionContent({ edition }: { edition: PublicPayload }) {
  const source = publicCitationUrl(edition.sourceUrl);
  return (
    <article className="public-edition-content">
      <h2>{edition.title}</h2>
      <p>{edition.summary}</p>
      <p>
        Published by {edition.publisher}. Coverage:{" "}
        {edition.coverage.replaceAll("_", " ")}. Language: {edition.language}.
      </p>
      {source && (
        <p>
          <a href={source} rel="noreferrer">
            Open the original source
          </a>
        </p>
      )}
      <p className="fine">
        A source claim and its interpretation are distinct. References help you
        inspect the claim; they do not establish that the advice is true.
      </p>
      {edition.insights.map((insight) => (
        <section className="example-evidence" key={insight.id}>
          <h3>{insight.title}</h3>
          <p>{insight.claim}</p>
          <p>{insight.interpretation}</p>
          <h4>Evidence references</h4>
          {insight.citations.length ? (
            <ul>
              {insight.citations.map((citation, index) => {
                const href = publicCitationUrl(citation.url);
                return (
                  <li key={index}>
                    {href ? (
                      <a href={href} rel="noreferrer">
                        {citation.label}
                      </a>
                    ) : (
                      <span>{citation.label}</span>
                    )}{" "}
                    <span className="fine">
                      ({citation.kind.replaceAll("_", " ")})
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>
              No public reference is included. Do not infer complete coverage.
            </p>
          )}
          {insight.uncertainty.length > 0 && (
            <>
              <h4>Uncertainty</h4>
              <ul>
                {insight.uncertainty.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </article>
  );
}
