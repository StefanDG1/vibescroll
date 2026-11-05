"use client";
import { useState } from "react";
import { setupDescriptor, setupPrompt } from "../../../packages/widget/setup";

export function McpConnectGuide() {
  const [message, setMessage] = useState("");
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(
        "Your browser could not copy automatically. Select and copy the text below.",
      );
    }
  };
  return (
    <section aria-label="MCP connection instructions">
      <div className="row">
        <button
          className="primary"
          onClick={() => void copy(setupPrompt, "Agent setup prompt")}
        >
          Copy agent setup prompt
        </button>
        <button
          className="secondary"
          onClick={() => void copy(setupDescriptor.server.url, "Server URL")}
        >
          Copy server URL
        </button>
      </div>
      <output aria-live="polite">{message}</output>
      <h2>Connect from ChatGPT</h2>
      <ol>
        <li>Open Plugins and add a custom MCP server.</li>
        <li>
          Use <code>{setupDescriptor.server.url}</code> with OAuth
          authentication.
        </li>
        <li>Complete the host confirmation and official sign-in yourself.</li>
        <li>
          Review the workspace and access you want to grant in VibeScroll
          Connections.
        </li>
        <li>
          Open VibeScroll in a new conversation. Widgets require a host with MCP
          Apps support.
        </li>
      </ol>
      <h2>Connect from Codex</h2>
      <p>
        Ask your agent to inspect its installed version and existing MCP
        configuration first. The normal HTTP setup is:
      </p>
      <pre>
        <code>{`codex mcp add vibescroll --url ${setupDescriptor.server.url}\ncodex mcp login vibescroll`}</code>
      </pre>
      <p>
        If the authorization server requires predefined public client
        configuration, use the host-specific configuration supplied by the
        operator. Never paste a private token, code, or password into chat.
      </p>
      <details>
        <summary>Read or copy the full agent prompt</summary>
        <textarea
          aria-label="Agent setup prompt"
          value={setupPrompt}
          readOnly
          rows={14}
          style={{ width: "100%", maxWidth: "100%" }}
        />
      </details>
      <h2>Check what is connected</h2>
      <p>
        The agent should verify a current profile and one private read. It
        should report tools, widget support, installed skills, analysis policy,
        and notification support separately. Setup does not need a test download
        or analysis.
      </p>
      <p>
        Missing access, workspace policies, or unsupported client features
        should be explained. The connection must never bypass permissions or
        silently select a paid processing route.
      </p>
    </section>
  );
}
