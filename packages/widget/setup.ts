import { appOrigin } from "./contracts";

export const setupDescriptor = {
  schemaVersion: "vibescroll-setup-v1",
  server: {
    name: "vibescroll",
    transport: "streamable-http",
    url: `${appOrigin}/mcp`,
    authentication: "oauth2-pkce",
  },
  instructions: `${appOrigin}/connect/agent`,
  accountSetup: `${appOrigin}/app`,
  verification: ["get_profile", "open_vibescroll"],
  notes: [
    "Adding an MCP server does not install the optional plugin skills.",
    "The host must support MCP Apps to display widgets.",
    "Use official browser authentication. Never paste credentials into chat.",
  ],
} as const;

export const setupPrompt = `Help me connect VibeScroll to this AI client and finish onboarding.
Read ${appOrigin}/connect/agent for current official instructions.
The expected Streamable HTTP server is ${appOrigin}/mcp.
Identify this client's supported configuration method. Inspect an existing connection first and preserve unrelated settings.
Use supported configuration tools or CLI when available; otherwise guide me through the exact client UI.
Let me complete official sign-in and consent. Never request or print passwords, cookies, OAuth codes, access tokens, or API secrets.
Do not disable approvals, add broad filesystem access, install a proxy, or change funding routes.
Verify actual tool access with get_profile and a minimal private read. An empty library is valid. Do not save a test source or start analysis merely to verify setup.
Help me select the right approved workspace and review existing analysis preferences without silently widening them.
Distinguish tools, widget rendering, packaged skills, Cloud policy, and notifications in the final readiness report.
If an entitlement is missing, explain the state without starting a purchase, checkout, or upgrade flow.`;

export const setupInstructions = `# Connect VibeScroll

Canonical server: ${appOrigin}/mcp
Transport: Streamable HTTP. Authentication: official OAuth authorization-code flow with PKCE.

## ChatGPT
Open Plugins, add a custom MCP server, enter the HTTPS URL, and select OAuth.
Complete the host's risk acknowledgement and official browser sign-in/consent yourself.
Your client/workspace must permit custom MCP connections. Refresh tools after server metadata changes.

## Codex
Inspect the installed client's help and existing configuration first:
codex mcp --help
codex mcp list

The supported basic HTTP configuration is:
codex mcp add vibescroll --url ${appOrigin}/mcp
codex mcp login vibescroll

Use the installed version's exact syntax. If the authorization server requires a predefined public client, use only the public client configuration supplied by the operator for this host. Never use a client secret or weaken callback validation.
Refresh the client session as required, then verify actual tool availability. A config entry alone is not proof of a connected session.

## Onboarding
Call get_profile. Select one explicitly approved workspace using its profile_id.
Open open_vibescroll to show the workspace when MCP Apps is supported.
Review missing account/grant setup through ${appOrigin}/app. Existing grants and processing defaults keep their authority until explicitly reviewed.
Customers use their own account and supported plan. Subscription purchase and billing remain on the independent website; the plugin does not initiate purchase or upgrade flows.

## Verify without side effects
A profile read and one permitted library read are sufficient. Do not create sources, start jobs, write feedback, or publish anything for a connection test.
Adding this URL does not automatically install skills or guarantee sidebar, Events, or Cloud support. Report these separately.

## Repair
Check endpoint, discovery, OAuth, current session loading, account/workspace, app grant, entitlement, and host UI support independently.
Preserve sources, running work, preferences, other servers, and security controls.
Use exact existing job receipts for recovery. Never retry unknown work on a paid route.
Never paste provider credentials, tokens, codes, or cookies into chat or diagnostic reports.
`;
