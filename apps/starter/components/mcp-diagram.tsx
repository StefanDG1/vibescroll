import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";

function Node({
  title,
  children,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="flow-node">
      <strong>{title}</strong>
      <span>{children}</span>
      {badge && <small>{badge}</small>}
    </div>
  );
}
function Connector({ label }: { label: string }) {
  return (
    <div className="flow-connector">
      <span>{label}</span>
      <ArrowRight className="flow-right" size={20} aria-hidden="true" />
      <ArrowDown className="flow-down" size={20} aria-hidden="true" />
    </div>
  );
}

export function McpDiagram({ kind }: { kind: string }) {
  if (kind === "journey") {
    const steps = [
      ["Save or find", "A link or an existing post", "Metadata first"],
      ["Get insights", "Reuse a result or analyze", "Explicit funding route"],
      ["Discuss a plan", "Use the post with a project", "One durable proposal"],
      ["Create the issue", "Approve its exact version", "No automatic coding"],
      [
        "Follow the work",
        "Read observations and reports",
        "Evidence has provenance",
      ],
    ];
    return (
      <figure
        className="mcp-diagram"
        aria-label="From a saved post to project work and feedback"
      >
        <ol className="flow-journey">
          {steps.map(([title, text, badge], index) => (
            <li key={title}>
              <span className="flow-step-number">{index + 1}</span>
              <Node title={title} badge={badge}>
                {text}
              </Node>
              {index < steps.length - 1 && (
                <ArrowRight aria-hidden="true" size={16} />
              )}
            </li>
          ))}
        </ol>
        <figcaption>
          Reopen the same saved records from the app or another authorized chat.
          A queued step is not a finished result.
        </figcaption>
      </figure>
    );
  }
  if (kind === "versions" || kind === "feedback") {
    const versions = kind === "versions";
    return (
      <figure
        className="mcp-diagram"
        aria-label={
          versions
            ? "Keep the selected analysis while reviewing a candidate"
            : "Two evidence paths return to the same saved work"
        }
      >
        <div className="flow-start">
          <Node
            title={
              versions ? "Request reanalysis" : "One approved GitHub issue"
            }
          >
            {versions
              ? "Reuse compatible preparation and keep the current result."
              : "The saved proposal binds its repository, issue and approved version."}
          </Node>
        </div>
        <div className="flow-fork" aria-hidden="true">
          <span />
          <ArrowDown size={20} />
          <ArrowDown size={20} />
        </div>
        <div className="flow-branches">
          <section>
            <p className="flow-path">
              {versions ? "Already selected" : "Provider observations"}
            </p>
            <Node
              title={versions ? "Incumbent result" : "Signed GitHub events"}
              badge={
                versions ? "Still usable" : "Verified source, bounded facts"
              }
            >
              {versions
                ? "Its insights, evidence and project references stay intact."
                : "Issue, PR or check state. An event does not prove business benefit."}
            </Node>
          </section>
          <section>
            <p className="flow-path">
              {versions ? "New attempt" : "Explicit reports"}
            </p>
            <Node
              title={
                versions ? "Candidate version" : "Assistant or user feedback"
              }
              badge={
                versions
                  ? "Quoted work; separate provenance"
                  : "Attributed report"
              }
            >
              {versions
                ? "Review its output, coverage and model provenance when ready."
                : "Completion, test claims or review notes remain separate from provider facts."}
            </Node>
          </section>
        </div>
        <div className="flow-join" aria-hidden="true">
          <span />
          <ArrowDown size={20} />
        </div>
        <div className="flow-start">
          <Node title={versions ? "Compare and select" : "One work record"}>
            {versions
              ? "Select the version you want, retaining history and rollback."
              : "Resume the proposal and see what was observed, reported or still unknown."}
          </Node>
        </div>
        <figcaption>
          {versions
            ? "A model name or higher reasoning setting alone does not prove better output."
            : "The current provider permissions and exact saved binding remain required."}
        </figcaption>
      </figure>
    );
  }
  if (!["architecture", "cache", "funding"].includes(kind)) return null;
  if (kind === "architecture")
    return (
      <figure
        className="mcp-diagram"
        aria-label="From a chat request to authorized saved data"
      >
        <div className="flow-linear">
          <Node title="Your chat" badge="Signed in to ChatGPT / Codex">
            The model selects a tool.
          </Node>
          <Connector label="Tool + arguments" />
          <Node title="VibeScroll MCP" badge="VibeScroll OAuth token">
            Validates the request.
          </Node>
          <Connector label="Authorized request" />
          <Node title="Convex" badge="Current membership + grant">
            Reads or changes permitted data.
          </Node>
        </div>
        <div className="flow-return">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>
            The result returns to the chat. The model explains it or takes the
            next authorized step.
          </span>
        </div>
        <figcaption>
          OpenAI authenticates model usage. VibeScroll independently
          authenticates data access. The model never receives a database admin
          key.
        </figcaption>
      </figure>
    );
  const cache = kind === "cache";
  return (
    <figure
      className="mcp-diagram"
      aria-label={
        cache
          ? "Shared cache hit versus a fresh analysis"
          : "Choose chat reasoning or a hosted API job"
      }
    >
      <div className="flow-start">
        <Node title={cache ? "You request a post" : "You ask for a plan"}>
          {cache
            ? "Check current access and the canonical saved result."
            : "The assistant reads your permitted insights and project context."}
        </Node>
      </div>
      <div className="flow-fork" aria-hidden="true">
        <span />
        <ArrowDown size={20} />
        <ArrowDown size={20} />
      </div>
      <div className="flow-branches">
        <section>
          <p className="flow-path">
            {cache ? "Compatible result exists" : "Write it in this chat"}
          </p>
          <Node
            title={cache ? "Reuse saved insights" : "ChatGPT / Codex writes"}
            badge={
              cache ? "0 new analysis credits" : "Uses your host allowance"
            }
          >
            {cache
              ? "No new download, transcription or model analysis."
              : "Save the supplied plan with save_project_proposal."}
          </Node>
        </section>
        <section>
          <p className="flow-path">
            {cache
              ? "A fresh analysis is needed"
              : "Explicitly start a hosted job"}
          </p>
          <Node
            title={
              cache
                ? "Prepare → analyze → retain"
                : "VibeScroll's API service writes"
            }
            badge={
              cache
                ? "Chosen route + quoted credits"
                : "Uses VibeScroll credits"
            }
          >
            {cache
              ? "Keep the new neutral version for authorized reuse."
              : "Quote first, then start_project_plan."}
          </Node>
        </section>
      </div>
      <div className="flow-join" aria-hidden="true">
        <span />
        <ArrowDown size={20} />
      </div>
      <div className="flow-start">
        <Node
          title={cache ? "Your saved post + insights" : "One saved proposal"}
        >
          {cache
            ? "Your association is personal. The neutral analysis can be shared."
            : "Resume the same version in the app or another connected chat."}
        </Node>
      </div>
      <figcaption>
        {cache
          ? "A cache hit still performs authorization and database reads. Private project context stays separate."
          : "The funding route follows where the AI runs, not where the request was typed."}
      </figcaption>
    </figure>
  );
}
