MCP is the connection between an assistant and VibeScroll's tools. It exposes functions with names, descriptions and input schemas. VibeScroll does not receive the whole chat or run the host's model.

## What makes the chat call a tool

1. Your host discovers tools from the connected MCP server using `tools/list`.
2. The model sees the available tool descriptions and input schemas alongside the conversation and any loaded instructions or skills.
3. When your request needs VibeScroll data or an action, the model selects a tool and supplies its arguments.
4. The host applies its own connection and approval rules, then sends `tools/call` to VibeScroll.
5. VibeScroll validates the arguments and authorization, performs the operation and returns a result. The model uses that result to continue the conversation.

Descriptions improve tool selection; they do not guarantee that a tool is selected for every request. Mentioning VibeScroll or explicitly asking to use its connected tools can remove ambiguity. This flow follows [OpenAI's MCP concepts](https://developers.openai.com/plugins/concepts/mcp-server).

## How a request reaches the database

The public endpoint is `https://scroll.companynerve.com/mcp`. Its Next.js route verifies the VibeScroll OAuth bearer token, including its signature, issuer, resource audience, client, user, consent session, scopes and timestamps. It forwards the same bearer token to the Convex HTTP action.

Convex independently validates the token. The HTTP handler applies a throttle and checks the token through AuthKit's user-info endpoint. The operation then checks the current VibeScroll user, workspace membership, grant, required action scope and applicable subscription or worker authority. A tool description cannot override those checks.

ChatGPT/Codex calls the server on your behalf. The model does not receive a database administrator credential, and a caller-supplied workspace ID cannot authorize another person's data. The [authentication guide](/docs/mcp/subscription) explains the separate host and VibeScroll sign-ins.

## What data the chat sends

The tool call contains the selected name and structured arguments: for example a search query, saved source ID, project ID, proposed text or an exact version reference. Requests also carry protocol and authentication metadata. VibeScroll does not automatically receive unrelated messages from the chat, repository files or your ChatGPT credentials.

A model can put user text into an argument when a tool accepts it. Do not interpret “no full chat access” as “no text ever leaves the chat.” The [generated schemas](/docs/mcp/tools) show the fields that can be sent.

## Shared analysis and personal context

A canonical post can have retained neutral analysis and evidence shared between authorized users. Asking to analyze that post can associate a compatible ready result with your library instead of repeating preparation and generation. Normal browsing does not subscribe every catalog post to your account.

Your notes, project context, proposals and discussions remain separate from the neutral shared result. Reading a shared result still checks your current access. A cache hit avoids new analysis; it does not remove authentication or database work.

## Automatic work is a separate path

An ordinary tool call happens in an active chat turn. A native Events subscription can notify a configured task about a saved link or completion. That task uses its saved instructions and authorized tools to continue work. It is not a promise that any unrelated chat receives an unsolicited completion message.

See [Skills and Events](/docs/mcp/skills) for the differences between tool metadata, packaged skills and the existing native monitor.
