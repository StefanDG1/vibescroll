# Continue a saved proposal as a GitHub issue

Mode: how-to. Implementation candidate under ADR209; check CURRENT-STATE before treating these two new tools as live. The existing proposal save/read flow is already accepted.

1. Open the saved proposal in ChatGPT or Codex using VibeScroll. Ask the assistant to read `get_project_proposal`, check the selected project and clarify missing implementation context.
2. Ask it to prepare an issue. It calls `prepare_project_issue` with the current proposal version, review and context hash, plus a stable request key. Preparation saves a private frozen package and does not publish or spend credits.
3. Review the issue title, body, target repository and any private project text before publication. Use your authorized GitHub integration to create the issue. An unknown GitHub response requires reconciling that attempt, not posting another issue.
4. The issue contains instructions for the implementing assistant to call `report_project_outcome` through its own authenticated VibeScroll connection. It reports completion, failure or blockage, actual issue/PR links and the actual commit when known. No secret is embedded in the issue. If the assistant lacks that connection, it records the limitation in GitHub instead of requesting a token.
5. Reopen the proposal through VibeScroll MCP to retrieve its frozen handoff and reports. A report is separate from verified GitHub lifecycle, CI, merge and actual benefit. Those independent observations are not implemented by this reporting step.

You can start with: “Read my VibeScroll proposal, check the project, and prepare a GitHub issue for me to review. Include the VibeScroll completion instructions. Do not implement or publish it yet.”

Handoff reporting expires after thirty days. The saved proposal, issue package and received reports remain retained under the existing result policy. Current access is checked again for every read/write. Issue text cannot grant coding, billing or publication authority.
