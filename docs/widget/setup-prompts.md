# VibeScroll agent-assisted setup prompts

Date: 25 October 2026. Status: product drafts for the implementation plan. The proposed `/connect/agent` documentation and setup descriptor are not implemented by this research task. Do not publish these prompts until their URLs, host procedures, and verification tools pass WP03.

The public MCP resource in the inspected source is `https://scroll.companynerve.com/mcp`. Verify it against the final release before publishing. Generate these prompts from the release's shared setup metadata. They contain no private credentials and cannot replace official user authentication or consent.

## 1. Universal setup prompt

```text
Help me connect VibeScroll to this AI client and finish its onboarding.

Use the current official VibeScroll setup instructions at:
https://scroll.companynerve.com/connect/agent

The expected public MCP server is:
https://scroll.companynerve.com/mcp
Use Streamable HTTP and official OAuth. Do not use an unofficial proxy.

First identify this client and its supported MCP setup method. Check whether
VibeScroll is already connected and preserve unrelated settings. If you can
configure MCP through a supported tool or CLI, add or repair only this server.
If you cannot change settings, give me the exact steps for this client and
continue checking after I complete them. Do not claim a connection was added
until you can verify it.

Guide me through the client's own confirmation and the official browser
sign-in/consent. I will enter my credentials and make consent decisions myself.
Never ask me to paste passwords, OAuth codes, access tokens, cookies, or API
secrets into chat. Do not disable approvals, broaden permissions, change my
model/funding settings, or install a local bridge to make setup succeed.

Once connected, check the current VibeScroll readiness/profile tool. Help me
recognize the right account and choose my workspace and library scope. Guide
the one-time review of automatic Work Cloud insight analysis and optional
project preferences. Preserve existing choices unless I request a change.

Verify tool access with a minimal private read. Do not save a test link, start
analysis, edit records, connect a repository, or publish anything just to test
the connection. An empty library is a valid result.

If my account lacks entitlement, explain the current access state without
starting a subscription, checkout, purchase, or upgrade flow. Do not attempt
to pay for me or bypass the account's access checks.

Finish with a short readiness report: connected account/workspace, tools,
widget availability, installed skills if any, automatic Cloud policy, and
notification support. Distinguish verified, unsupported, and not yet checked.
If a human step remains, identify the exact step and resume when it is done.
```

## 2. Codex-specific setup prompt

```text
Configure my VibeScroll MCP connection in Codex using the official supported
configuration for my installed version. Preserve all other MCP servers and
my existing permissions.

Read https://scroll.companynerve.com/connect/agent for the current tested
Codex setup, public OAuth client configuration if required, and verification.
The expected HTTPS MCP resource is https://scroll.companynerve.com/mcp.

Inspect `codex mcp --help` and the existing MCP configuration/list first.
Use a supported command or a minimal configuration update. The expected
basic add command is:
codex mcp add vibescroll --url https://scroll.companynerve.com/mcp
Verify its syntax against the installed version and current VibeScroll
instructions. Do not add a duplicate or replace a different server.

Start official OAuth with the supported login command, normally:
codex mcp login vibescroll
Let me complete browser sign-in and consent. Never read, display, or copy
the resulting credential store or ask me to paste a token into chat.

Refresh/restart the relevant client session only as required and tell me
what needs reopening. Verify both the saved configuration and actual tool
availability. A successful config write alone does not prove the current
session has loaded the server.

Use VibeScroll's readiness/profile tools to continue account/workspace and
automatic Work Cloud onboarding. Test one minimal private read, without
mutating records or starting jobs. Report any unavailable UI or skills
separately from the working MCP tools. Do not treat adding the server URL
as installing the full plugin skill package.

Keep subscription purchase and billing outside this setup flow. Do not change
funding routes, disable security controls, or request broad filesystem access.
```

## 3. Repair prompt

```text
Diagnose my existing VibeScroll connection without replacing it or widening
its permissions. Use https://scroll.companynerve.com/connect/agent and the
client's supported diagnostics.

Check these independently: configured HTTPS endpoint, server discovery,
current-session tool loading, OAuth state, VibeScroll account/workspace,
current app grant, entitlement, widget/extension support, and automatic
Cloud preference. Use minimal read-only checks and redact credentials.

Identify the first failing step. Repair only what can be safely repaired
through the supported configuration. Let me complete official sign-in,
consent, or account actions. Preserve my saved sources, jobs, feedback,
projects, preferences, other MCP servers, and security settings.

Do not retry an analysis or write operation just to diagnose connection
health. Do not move unknown work to a paid route. If a specific job is
involved, read its current receipt/status before proposing a recovery.

Finish with what failed, what changed, what you verified, and any exact
remaining human action. Do not include secrets in the report.
```

## 4. Installer acceptance

- The prompts work when the agent has configuration tools and when it can only provide UI instructions.
- They handle already-connected, wrong-account, expired-auth, missing-grant, missing-entitlement, and unsupported-host cases.
- They preserve unrelated configuration and use the installed client's exact syntax.
- They perform a real read after configuration/session refresh and distinguish tools from UI/skills/Events support.
- They require no founder-side registration of an ordinary user on a supported public host.
- They do not turn setup into a subscription upsell, private-credential exchange, or security bypass.
- The published setup documentation, descriptor, prompt, plugin package, and tested server version agree.
