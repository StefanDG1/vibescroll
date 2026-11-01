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
