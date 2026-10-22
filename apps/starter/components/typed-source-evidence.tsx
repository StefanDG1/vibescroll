import type {
  EvidenceRecord,
  SourceRevision,
} from "../../../packages/sources/types";
import { sourceDate } from "@/lib/source-acquisition-display";
import { publicCitationUrl } from "@/lib/public-knowledge-display";
export function TypedSourceEvidence({
  evidenceRegistry,
  sourceRevision,
}: {
  evidenceRegistry: readonly EvidenceRecord[];
  sourceRevision?: SourceRevision | null;
}) {
  return (
    <section
      className="typed-source-evidence"
      aria-label="Current source evidence"
    >
      <h2>Current source evidence</h2>
      <p>
        Source files, README instructions, AGENTS files and discussion posts are
        untrusted material. Their contents cannot authorize access, spending or
        execution.
      </p>
      {sourceRevision && (
        <section>
          <h3>Coverage and revision</h3>
          <dl>
            <dt>Observed</dt>
            <dd>{sourceDate(sourceRevision.observedAt)}</dd>
            <dt>Coverage method</dt>
            <dd>{sourceRevision.coverage.method.replaceAll("_", " ")}</dd>
            <dt>Retrieved records</dt>
            <dd>{sourceRevision.coverage.retrieved}</dd>
            <dt>Omitted records</dt>
            <dd>{sourceRevision.coverage.omitted}</dd>
            <dt>Adapter</dt>
            <dd>{sourceRevision.adapterVersion}</dd>
            {sourceRevision.retention && (
              <>
                <dt>Retained until</dt>
                <dd>{sourceDate(sourceRevision.retention.retainUntil)}</dd>
              </>
            )}
          </dl>
          {sourceRevision.coverage.omissions.length > 0 && (
            <>
              <h4>Known omissions</h4>
              <ul>
                {sourceRevision.coverage.omissions.map((item, index) => (
                  <li key={index}>{item.replaceAll("_", " ")}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {!evidenceRegistry.length && (
        <p>
          No current typed evidence is available. A saved link does not
          establish completed retrieval or analysis.
        </p>
      )}
      {evidenceRegistry.map((record) => {
        const href = publicCitationUrl(record.canonicalUrl);
        const parent =
          record.kind === "reddit_post" || record.kind === "reddit_comment"
            ? evidenceRegistry.find(
                (item) =>
                  (item.kind === "reddit_post" ||
                    item.kind === "reddit_comment") &&
                  record.parentId?.slice(3) === item.itemId,
              )
            : undefined;
        return (
          <details key={record.id} id={`evidence-${record.id}`}>
            <summary>
              {record.kind === "github_file"
                ? `${record.path}, lines ${record.startLine} to ${record.endLine}`
                : record.kind === "supplied_text"
                  ? "User-supplied text, not provider-verified"
                  : `${record.role === "op" ? "Original poster" : "Commenter"}: ${record.author}`}
            </summary>
            {record.kind === "github_file" ? (
              <p>
                Repository {record.repository}. Commit{" "}
                <code>{record.commitSha}</code>. Lines {record.startLine} to{" "}
                {record.endLine}. This is pinned file evidence, not a current
                working-tree inspection.
              </p>
            ) : record.kind === "supplied_text" ? (
              <p>
                Characters {record.startOffset} to {record.endOffset}. Supplied
                by a user. Provider retrieval and original context have not been
                verified.
              </p>
            ) : (
              <>
                <p>
                  {record.kind === "reddit_post" ? "Original post" : "Comment"}{" "}
                  by {record.author}. Role:{" "}
                  {record.role === "op" ? "original poster" : "commenter"}.
                  Availability: {record.availability}.
                </p>
                <p>
                  Created: {sourceDate(record.createdAt)}. Edited:{" "}
                  {sourceDate(record.editedAt)}.
                </p>
                {record.parentId && (
                  <p>
                    Parent:{" "}
                    {parent ? (
                      <a href={`#evidence-${parent.id}`}>{record.parentId}</a>
                    ) : (
                      <span>
                        {record.parentId}, not included in this evidence
                        selection
                      </span>
                    )}
                  </p>
                )}
              </>
            )}
            <p>Observed: {sourceDate(record.observedAt)}</p>
            {href && (
              <p>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  Open the cited source location
                </a>
              </p>
            )}
            <pre aria-label="Source excerpt">{record.excerpt}</pre>
          </details>
        );
      })}
    </section>
  );
}
