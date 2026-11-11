# Later MCP suggestions

Status: saved for later under R137. Outside the current implementation scope. Review these separately after the core MCP plan is accepted in production.

- **Capability discovery:** a small read that says which actions/routes/scopes are actually available and what exact setup is missing could replace repeated broad profile reads. Prefer extending an existing small discovery response if it avoids another overlapping tool.
- **Changes since last visit:** an authorized cursor-based updates read can support “what finished since yesterday?” without re-fetching the library. Events and this read should share durable change identifiers. Avoid replaying sensitive details after access is removed.
- **Context freshness:** make project snapshot age/revision visible. Refresh one stale project only when needed, with its existing authority, instead of evaluating every repository on each post.
- **Model/version policy:** use an owner-controlled compatibility and selection policy. Keep candidates and the selected incumbent distinct; newer names or higher reasoning are not automatic proof of better analysis. Add reviewed promotion/rollback and later outcome-based experiments.
- **Read-only explorer:** a synthetic public API/MCP example explorer could help developers understand outputs without signing in or spending credits. Do not build an interactive paid-tool console into beginner docs.
- **Documentation quality feedback:** provide source/edit/report links and a minimal helpfulness signal if there is a concrete use for it. A documentation chatbot or paid search service is unnecessary now.
- **Community and broader analytics:** retain individual-Pro workspace membership and requested-post cache boundaries. Rich community features, model A/B rankings, creator/category trends and proposal-outcome learning remain later work, with explicit sample sizes and private-project isolation.
- **Technical cleanup:** separately remove the existing Help loader's broad filesystem tracing, investigate unsupported CSS-highlight warnings and retire proven-unused compatibility code. Do not bundle unrelated cleanup with a tool-contract migration or reintroduce a frontend rewrite.
