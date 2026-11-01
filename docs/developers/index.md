VibeScroll connects saved posts, cited insights and private project plans across the website and your assistant. Start with the result you want. Each workflow identifies its tools, waiting points and funding boundary.

## Choose a workflow

- [Find and save a post](/docs/workflows/find-save): search existing knowledge or save one supplied link.
- [Get insights and track progress](/docs/workflows/analyze): reuse ready results or choose a supported analysis route.
- [Compare and select analysis versions](/docs/workflows/reanalyze): preserve an existing result while requesting or reviewing another version.
- [Apply insights to a project](/docs/workflows/proposals): use the full post context and save a chat-written proposal.
- [Discuss and revise a plan](/docs/workflows/discussion): resume discussion across chats or choose quoted API generation.
- [Approve an issue and follow the work](/docs/workflows/handoff): publish one reviewed issue and distinguish reports from observed outcomes.

## Understand the connection

- [How the MCP works](/docs/mcp): what makes a model choose a tool, how requests reach Convex, and what the server can see.
- [Subscriptions and authentication](/docs/mcp/subscription): use your host's model allowance for in-chat work; distinguish VibeScroll OAuth, processing credits and API funding.
- [Use saved insights in a chat](/docs/mcp/first-workflow): a first read-and-plan workflow without a paid model job.

## Look up the contract

- [Tool reference](/docs/mcp/tools): actual names, descriptions, strict input schemas, OAuth scopes and side-effect hints, generated from the registry.
- [Results, limits and errors](/docs/mcp/results): output families, pagination, version binding, evidence and billing states.
- [Skills and Events](/docs/mcp/skills): the nine packaged skills and the separate background monitor.
- [Shared data and Convex usage](/docs/mcp/efficiency): current read shapes, known limits and proposed improvements.
- [Host support](/docs/mcp/host-support): website, custom MCP, skills, images and Events, with verification limits.
- [Contribute to the docs](/docs/contributing): source, generation and synthetic example checks.
- [Changelog](/docs/changelog): published checkpoints and the current local candidate.

## Verification and source

This documentation was audited against the November 1, 2026 implementation. Tool availability depends on deployed feature flags, permissions and what your host has discovered. Generated descriptors describe the full supported registry; they do not prove that every tool is visible in every connected chat.

The [MIT source](https://github.com/StefanDG1/vibescroll) includes the MCP registry, strict contracts, plugin skills and tests. Public documentation uses synthetic examples and does not query your library. The docs interface uses [Fumadocs](https://github.com/fuma-nama/fumadocs), an MIT-licensed React documentation framework.
