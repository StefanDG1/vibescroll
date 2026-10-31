---
name: vibescroll-setup
description: Connect VibeScroll, finish onboarding, select an approved workspace or repair its connection in ChatGPT or Codex.
---

# Connect and verify VibeScroll

1. Identify the current host and inspect whether the VibeScroll tools are already available. Preserve existing MCP configuration and security settings.
2. If configuration is needed, read the current public instructions at https://scroll.companynerve.com/connect/agent. The canonical Streamable HTTP resource is https://scroll.companynerve.com/mcp. Use only supported host configuration and official OAuth.
3. Guide the person through browser sign-in and consent. Never request, print, copy or store passwords, codes, cookies or tokens in chat. Do not bypass approvals or add broad local permissions.
4. Call `get_profile` when its context permission is available. Show only returned approved profiles; do not infer account identity from email. Ask for a profile only if more than one requires a choice.
5. Open `open_vibescroll` with the selected profile. The widget can discover knowledge-readable workspaces independently of project context permission.
6. A profile/library read is enough to verify setup. Do not save sample sources, start analysis, write feedback or create drafts merely to check the connection.
7. Missing access requires the protected VibeScroll Connections flow. Existing grants, processing policies and funding routes retain their authority until explicitly reviewed.

Report account/workspace readiness, tool access, optional widget/skills support and any exact remaining human action. Distinguish verified, unsupported and not tested. Do not turn setup into a subscription purchase or upgrade flow. The plugin can access an existing paid account; it does not initiate checkout.
