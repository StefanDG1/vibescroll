VibeScroll's MCP server gives an assistant structured access to your saved posts, cited insights and selected project context. You can discuss a plan in ChatGPT or Codex and save it back to VibeScroll. A tool can also start a separately funded processing job when you choose that route.

## Understand the connection

- [How the MCP works](/docs/mcp): what makes a model choose a tool, how requests reach Convex, and what the server can see.
- [Subscriptions and authentication](/docs/mcp/subscription): use your host's model allowance for in-chat work; distinguish VibeScroll OAuth, processing credits and API funding.
- [Use saved insights in a chat](/docs/mcp/first-workflow): a first read-and-plan workflow without a paid model job.

## Look up the contract

- [Tool reference](/docs/mcp/tools): actual names, descriptions, strict input schemas, OAuth scopes and side-effect hints, generated from the registry.
- [Results, limits and errors](/docs/mcp/results): output families, pagination, version binding, evidence and billing states.
- [Skills and Events](/docs/mcp/skills): the nine packaged skills and the separate background monitor.
- [Shared data and Convex usage](/docs/mcp/efficiency): current read shapes, known limits and proposed improvements.

## Verification and source

This documentation was audited against the November 1, 2026 implementation. Tool availability depends on deployed feature flags, permissions and what your host has discovered. Generated descriptors describe the full supported registry; they do not prove that every tool is visible in every connected chat.

The [MIT source](https://github.com/StefanDG1/vibescroll) includes the MCP registry, strict contracts, plugin skills and tests. Public documentation uses synthetic examples and does not query your library. The docs interface uses [Fumadocs](https://github.com/fuma-nama/fumadocs), an MIT-licensed React documentation framework.
