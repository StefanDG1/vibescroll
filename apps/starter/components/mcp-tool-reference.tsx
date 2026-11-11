"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { guideForTool, toolGroups } from "../../../packages/mcp/tool-guide";

type ReferenceTool = {
  name: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  annotations: {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  securitySchemes: { scopes?: string[] }[];
};
const fundingLabels = {
  no_ai: "No VibeScroll model call",
  quote: "Quote only",
  credits: "Can use credits",
  host_worker: "Host worker step",
  conditional: "Depends on the route",
};

export function McpToolReference({ tools }: { tools: ReferenceTool[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [skill, setSkill] = useState("all");
  const [action, setAction] = useState("all");
  const [view, setView] = useState("workflow");
  const [advanced, setAdvanced] = useState(true);
  const [selected, setSelected] = useState("");
  const skills = useMemo(
    () =>
      [
        ...new Set(
          tools.flatMap((tool) => guideForTool(tool.name)?.skills ?? []),
        ),
      ].sort(),
    [tools],
  );

  useEffect(() => {
    const reveal = () => {
      let name = "";
      try {
        name = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (
        !tools.some((tool) => tool.name === name) &&
        !toolGroups.some((item) => `tool-group-${item.id}` === name)
      )
        return;
      setQuery("");
      setGroup("all");
      setSkill("all");
      setAction("all");
      setAdvanced(true);
      setSelected(name);
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [tools]);
  useEffect(() => {
    if (!selected) return;
    const node = document.getElementById(selected);
    if (node instanceof HTMLDetailsElement) node.open = true;
    node?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [selected]);

  const filtered = useMemo(
    () =>
      tools.filter((tool) => {
        const guide = guideForTool(tool.name);
        if (!guide) return false;
        const category = toolGroups.find((item) => item.id === guide.group)!;
        return (
          (advanced || category.audience === "general") &&
          (group === "all" || guide.group === group) &&
          (skill === "all" || guide.skills.includes(skill)) &&
          (action === "all" ||
            Boolean(tool.annotations.readOnlyHint) === (action === "read")) &&
          `${tool.name} ${guide.purpose} ${guide.result} ${tool.description} ${category.title} ${guide.skills.join(" ")}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        );
      }),
    [tools, query, group, skill, action, advanced],
  );

  function renderTool(tool: ReferenceTool) {
    const guide = guideForTool(tool.name)!;
    return (
      <details key={tool.name} id={tool.name}>
        <summary>
          <code>{tool.name}</code>
          <span>{tool.annotations.readOnlyHint ? "Read" : "Action"}</span>
        </summary>
        <div>
          <p>{guide.purpose}</p>
          <p className="tool-funding">{fundingLabels[guide.funding]}</p>
          <h3>Returned data</h3>
          <p>{guide.result}</p>
          {tool.outputSchema !== undefined && (
            <>
              <h3>Output schema</h3>
              <pre>
                <code>{JSON.stringify(tool.outputSchema, null, 2)}</code>
              </pre>
            </>
          )}
          <p className="fine">
            This summary is source-derived. Exact output contracts and limits
            are linked below; the input schema is generated from the actual
            registry.
          </p>
          <p>
            <Link href={guide.flow}>Follow the workflow</Link>
            {" · "}
            <Link href="/docs/mcp/results">Result fields and recovery</Link>
          </p>
          {guide.skills.length > 0 && (
            <p>
              Related skills:{" "}
              {guide.skills.map((name, i) => (
                <span key={name}>
                  {i > 0 && ", "}
                  <Link href={`/docs/mcp/skills#${name}`}>
                    {name.replace("vibescroll-", "")}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <h3>OAuth scopes</h3>
          <p>
            {tool.securitySchemes
              .flatMap((scheme) => scheme.scopes ?? [])
              .map((scope) => (
                <code key={scope}>{scope} </code>
              ))}
          </p>
          <h3>Input schema</h3>
          <pre>
            <code>{JSON.stringify(tool.inputSchema, null, 2)}</code>
          </pre>
          <h3>Side-effect hints</h3>
          <pre>
            <code>{JSON.stringify(tool.annotations, null, 2)}</code>
          </pre>
          <details className="tool-description">
            <summary>Full model-facing description</summary>
            <p>{tool.description}</p>
          </details>
        </div>
      </details>
    );
  }

  return (
    <section
      aria-label="Generated MCP tool descriptors"
      className="mcp-reference"
    >
      <div className="mcp-tool-filters">
        <label className="tool-search">
          Search tools
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setSelected("");
              setQuery(event.target.value);
            }}
            placeholder="Try captions, proposal or credits"
          />
        </label>
        <label>
          Workflow
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            <option value="all">All workflows</option>
            {toolGroups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Skill
          <select
            value={skill}
            onChange={(event) => setSkill(event.target.value)}
          >
            <option value="all">All skills</option>
            {skills.map((item) => (
              <option key={item} value={item}>
                {item.replace("vibescroll-", "")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="all">Reads and actions</option>
            <option value="read">Reads</option>
            <option value="action">Actions</option>
          </select>
        </label>
        <label>
          View
          <select
            value={view}
            onChange={(event) => setView(event.target.value)}
          >
            <option value="workflow">By workflow</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </label>
        <label className="tool-advanced">
          <input
            type="checkbox"
            checked={advanced}
            onChange={(event) => setAdvanced(event.target.checked)}
          />
          Include advanced tools
        </label>
      </div>
      <p aria-live="polite">
        {filtered.length} of {tools.length} full-feature descriptors. Host
        availability and current permissions still apply.
      </p>
      {filtered.length === 0 && (
        <p>
          No tools match these filters.{" "}
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setGroup("all");
              setSkill("all");
              setAction("all");
              setAdvanced(true);
            }}
          >
            Clear filters
          </button>
        </p>
      )}
      {view === "alphabetical"
        ? filtered.map(renderTool)
        : toolGroups.map((item) => {
            const members = filtered.filter(
              (tool) => guideForTool(tool.name)?.group === item.id,
            );
            return (
              members.length > 0 && (
                <section
                  key={item.id}
                  aria-labelledby={`tool-group-${item.id}`}
                >
                  <h2 id={`tool-group-${item.id}`}>{item.title}</h2>
                  <p>{item.description}</p>
                  {members.map(renderTool)}
                </section>
              )
            );
          })}
    </section>
  );
}
