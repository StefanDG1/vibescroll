import {
  type McpServer,
  requireScopes,
  ResourceTemplate,
} from "@modelcontextprotocol/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
import { z } from "zod";
import {
  widgetRoute,
  widgetBrowseInput,
  widgetTopicInput,
  widgetProposalInput,
  safeAppUrl,
  appOrigin,
} from "../widget/contracts";
import {
  widgetResources,
  widgetResourceUris,
} from "../widget/resources.generated";
import { widgetOutputs, validateWidgetOutput } from "../widget/outputs";
import { feedbackStateInput } from "../widget/feedback";
import {
  libraryEditInput,
  libraryEditStateInput,
  libraryEditReceiptInput,
  libraryEditRejection,
} from "../widget/library-edits";
import {
  filingInput,
  filingStateInput,
  filingReceiptInput,
  filingRejection,
} from "../widget/evidence-filing";

type Invoke = (
  operation: string,
  args: Record<string, unknown>,
) => Promise<{ ok: boolean; status: number; value: Record<string, unknown> }>;
export function registerWidget(
  server: McpServer,
  invoke: Invoke,
  libraryEditingEnabled = false,
) {
  const app = new OpenAIExtensions(server);
  const resultSchema = z.record(z.string(), z.unknown());
  const read = async (operation: string, args: Record<string, unknown>) => {
    const response = await invoke(operation, args);
    if (!response.ok)
      throw new Error(
        "Review your current VibeScroll connection, workspace and access grant.",
      );
    return validateWidgetOutput(operation, response.value);
  };
  const reply = (
    data: Record<string, unknown>,
    text = "VibeScroll returned the current authorized view.",
  ) => ({
    structuredContent: data,
    content: [{ type: "text" as const, text }],
  });
  const uri = (kind: keyof typeof widgetResources) => widgetResourceUris[kind];
  server.registerResource(
    "vibescroll-citation",
    new ResourceTemplate("vibescroll://profile/{profileId}/source/{sourceId}", {
      list: undefined,
    }),
    {
      title: "Current VibeScroll citation",
      mimeType: "application/json",
      scopeChallenge: requireScopes("knowledge:read"),
    },
    async (resourceUri, variables) => {
      if (
        typeof variables.profileId !== "string" ||
        typeof variables.sourceId !== "string" ||
        variables.profileId.length > 100 ||
        variables.sourceId.length > 300
      )
        throw new Error("Invalid source reference.");
      const data = await read("fetch", {
        profileId: variables.profileId,
        id: variables.sourceId,
      });
      return {
        contents: [
          {
            uri: resourceUri.href,
            mimeType: "application/json",
            text: JSON.stringify(data),
          },
        ],
      };
    },
  );
  for (const kind of ["workspace", "card", "export"] as const) {
    const metadata = {
      title: `VibeScroll ${kind}`,
      mimeType: "text/html;profile=mcp-app",
      scopeChallenge: requireScopes("knowledge:read"),
    };
    const resource = (requestedUri: string) => ({
      contents: [
        {
          uri: requestedUri,
          mimeType: "text/html;profile=mcp-app",
          text: widgetResources[kind],
          _meta: {
            ui: {
              prefersBorder: kind === "card",
              domain: appOrigin,
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
              },
            },
            "openai/widgetDescription":
              kind === "card"
                ? "A focused VibeScroll result with citations and current status. Avoid repeating its contents."
                : "VibeScroll private knowledge workspace: browse evidence, save sources, and review projects using the user's current grant.",
            "openai/ui": {
              preferredDisplayMode:
                kind === "workspace" ? "fullscreen" : "inline",
              availableDisplayModes:
                kind === "workspace"
                  ? ["fullscreen", "inline"]
                  : ["inline", "fullscreen"],
            },
          },
        },
      ],
    });
    server.registerResource(
      `vibescroll-${kind}`,
      uri(kind),
      metadata,
      async () => resource(uri(kind)),
    );
    // Old conversation cards retain the v1 data contract. An uncached legacy
    // resource read receives the current compatible UI and reauthorizes data.
    server.registerResource(
      `vibescroll-${kind}-compatible`,
      new ResourceTemplate(`ui://vibescroll/${kind}/{version}.html`, {
        list: undefined,
      }),
      metadata,
      async (requestedUri, variables) => {
        if (
          typeof variables.version !== "string" ||
          !/^v1(?:-[a-f0-9]{16})?$/.test(variables.version)
        )
          throw new Error("Unsupported widget resource version.");
        return resource(requestedUri.href);
      },
    );
  }
  const scopes = {
    securitySchemes: [{ type: "oauth2", scopes: ["knowledge:read"] }],
  };
  server.registerTool(
    "open_vibescroll_export",
    {
      title: "View VibeScroll export",
      description:
        "Read a user-opened .vibescroll snapshot in a read-only viewer. Opening it does not import records or grant live data access.",
      inputSchema: z
        .object({
          file: z
            .object({ resourceUri: z.string().min(1).max(4096) })
            .passthrough()
            .optional(),
        })
        .passthrough(),
      outputSchema: resultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopeChallenge: requireScopes("knowledge:read"),
      _meta: {
        ...scopes,
        ui: { resourceUri: uri("export"), visibility: ["model", "app"] },
        "openai/ui": {
          entrypoints: [{ type: "file", extensions: [".vibescroll"] }],
        },
      },
    },
    async () =>
      reply(
        { schema_version: "vibescroll-widget-v1", route: { view: "export" } },
        "Opened a read-only VibeScroll snapshot viewer.",
      ),
  );
  server.registerTool(
    "open_vibescroll",
    {
      title: "Open VibeScroll",
      description:
        "Open the current private VibeScroll workspace to browse sources, cited insights, topics and approved projects. Accepts empty arguments for sidebar and conversation entrypoints. This starts no processing, spending or publication.",
      inputSchema: widgetRoute.partial(),
      outputSchema: resultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopeChallenge: requireScopes("knowledge:read"),
      _meta: {
        ...scopes,
        ui: { resourceUri: uri("workspace"), visibility: ["model", "app"] },
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    async (args) =>
      reply(
        {
          schema_version: "vibescroll-widget-v1",
          route: widgetRoute.parse(args),
          snapshot: args.profileId
            ? await read("widget_state", { profileId: args.profileId })
            : await read("widget_profiles", {}),
        },
        "Opened your current authorized VibeScroll workspace.",
      ),
  );
  server.registerTool(
    "render_vibescroll_card",
    {
      title: "Show VibeScroll result",
      description:
        "Show a compact cited result or job receipt for an exact authorized VibeScroll source. Use after saving, searching or fetching. Reloads current permitted data; takes IDs, not arbitrary model-written claims.",
      inputSchema: z
        .object({
          profileId: z.string().min(1).max(300).optional(),
          sourceId: z.string().min(1).max(300),
          view: z.enum(["insight", "status"]).default("insight"),
        })
        .strict(),
      outputSchema: resultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopeChallenge: requireScopes("knowledge:read"),
      _meta: {
        ...scopes,
        ui: { resourceUri: uri("card"), visibility: ["model", "app"] },
      },
    },
    async (args) => {
      const data = await read(
        args.view === "status" ? "get_job_status" : "fetch",
        args.view === "status"
          ? { profileId: args.profileId, sourceId: args.sourceId }
          : { profileId: args.profileId, id: args.sourceId },
      );
      return reply(
        {
          schema_version: "vibescroll-widget-v1",
          route: {
            view: args.view === "status" ? "save" : "insight",
            profileId: args.profileId,
            sourceId: args.sourceId,
          },
          data,
        },
        "Showing the current VibeScroll result. Citations and review actions are in the card.",
      );
    },
  );
  const operations = [
    [
      "widget_profiles",
      "Discover current knowledge-readable workspace grants without disclosing selected project context.",
      z.object({}).strict(),
    ],
    [
      "widget_state",
      "Read the current authorized workspace, access and available actions.",
      z.object({ profileId: z.string().max(300).optional() }).strict(),
    ],
    [
      "widget_browse",
      "Browse one bounded page of authorized sources, topics, current work or private proposals. Does not start analysis.",
      widgetBrowseInput,
    ],
    [
      "widget_topic",
      "Read one bounded page of current permitted topic evidence.",
      widgetTopicInput,
    ],
    [
      "widget_proposal",
      "Read an exact current private proposal and its protected review destination.",
      widgetProposalInput,
    ],
  ] as const;
  for (const [name, description, schema] of operations)
    server.registerTool(
      name,
      {
        title: description.split(".")[0],
        description,
        inputSchema: schema,
        outputSchema: widgetOutputs[name],
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes("knowledge:read"),
        _meta: { ...scopes, ui: { visibility: ["app"] } },
      },
      async (args: Record<string, unknown>) => reply(await read(name, args)),
    );

  server.registerTool(
    "widget_feedback_state",
    {
      title: "Read my current source judgment",
      description:
        "Read only this connection's current user's judgment for the exact permitted source version, or reconcile its known key. Starts no work.",
      inputSchema: feedbackStateInput,
      outputSchema: widgetOutputs.widget_feedback_state,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopeChallenge: requireScopes("knowledge:read", "feedback:write"),
      _meta: {
        securitySchemes: [
          { type: "oauth2", scopes: ["knowledge:read", "feedback:write"] },
        ],
        ui: { visibility: ["app"] },
      },
    },
    async (args: Record<string, unknown>) =>
      reply(await read("widget_feedback_state", args)),
  );
  if (libraryEditingEnabled) {
    const edits = [
      [
        "widget_evidence_state",
        "Read current topic filings for one exact cited idea.",
        filingStateInput,
        true,
      ],
      [
        "widget_evidence_receipt",
        "Reconcile the retained result of an idea filing before retrying.",
        filingReceiptInput,
        true,
      ],
      [
        "widget_evidence_edit",
        "Move, remove or restore one exact idea filing after an explicit user action. Starts no processing.",
        filingInput,
        false,
      ],
      [
        "widget_library_state",
        "Read the current topic and versions for a reviewed library edit.",
        libraryEditStateInput,
        true,
      ],
      [
        "widget_library_receipt",
        "Reconcile an existing edit key before retrying an uncertain change.",
        libraryEditReceiptInput,
        true,
      ],
      [
        "widget_library_edit",
        "Apply one explicitly requested topic name, pin or folder change with exact versions and a stable key. Starts no processing.",
        libraryEditInput,
        false,
      ],
    ] as const;
    for (const [name, description, inputSchema, readOnlyHint] of edits)
      server.registerTool(
        name,
        {
          title: description.split(".")[0],
          description,
          inputSchema,
          outputSchema: widgetOutputs[name],
          annotations: {
            readOnlyHint,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes("knowledge:read", "knowledge:write"),
          _meta: {
            securitySchemes: [
              { type: "oauth2", scopes: ["knowledge:read", "knowledge:write"] },
            ],
            ui: { visibility: ["app"] },
          },
        },
        async (args: Record<string, unknown>) => {
          const response = await invoke(name, args);
          if (!response.ok) {
            if (name === "widget_evidence_edit") {
              const rejected = filingRejection.safeParse(response.value);
              if (rejected.success)
                return reply(
                  rejected.data,
                  "The filing was rejected. No idea filing changed.",
                );
            }
            if (name === "widget_library_edit") {
              const rejected = libraryEditRejection.safeParse(response.value);
              if (rejected.success)
                return reply(
                  rejected.data,
                  "The topic change was rejected. No topic update occurred.",
                );
            }
            throw new Error(
              "The library change is not confirmed. Check its existing result before retrying, or review current access in Connections.",
            );
          }
          return reply(validateWidgetOutput(name, response.value));
        },
      );
  }
  app.mentions.setHandler(async ({ query }) => {
    const data = query.trim()
      ? await read("search", { query: query.slice(0, 200) })
      : await read("widget_browse", { kind: "sources" });
    const rows = (data.results ?? data.items ?? []) as {
      id: string;
      title: string;
      url?: string;
    }[];
    return {
      items: rows.slice(0, 8).flatMap((row) => {
        const url = safeAppUrl(row.url);
        return url
          ? [
              {
                type: "resource_link" as const,
                uri: `vibescroll://profile/${encodeURIComponent(String(data.profile_id))}/source/${encodeURIComponent(row.id)}`,
                name: row.title.slice(0, 200),
                mimeType: "application/json",
              },
            ]
          : [];
      }),
    };
  });
}
