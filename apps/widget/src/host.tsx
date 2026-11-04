/* eslint-disable react/immutability -- The MCP SDK is a mutable protocol client; effect-owned handlers are registered before connect and removed on teardown. */
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  decodeToolResult,
  parseAppRoute,
  widgetExport,
  widgetRoute,
  safeAppUrl,
  type ToolRecord,
  type ToolResult,
  type WidgetRoute,
} from "../../../packages/widget/contracts";

type Host = {
  ready: boolean;
  demo: boolean;
  error: string;
  payload: ToolRecord | null;
  input: ToolRecord | null;
  initialPending: boolean;
  route: WidgetRoute | null;
  theme: "light" | "dark";
  fullscreen: boolean;
  canMessage: boolean;
  canContext: boolean;
  canDownload: boolean;
  call: (name: string, args: ToolRecord) => Promise<ToolRecord>;
  readImage: (name: string, args: ToolRecord) => Promise<string>;
  open: (url: string) => Promise<void>;
  message: (text: string) => Promise<void>;
  attach: (text: string, data?: ToolRecord) => Promise<void>;
  expand: () => Promise<void>;
  download: (text: string) => Promise<boolean>;
};
const HostContext = createContext<Host | null>(null);
const isDemo =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("demo") === "1";

export function HostProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    ready: false,
    error: "",
    payload: null as ToolRecord | null,
    input: null as ToolRecord | null,
    initialPending: false,
    route: null as WidgetRoute | null,
    theme: (isDemo &&
    new URLSearchParams(location.search).get("theme") === "dark"
      ? "dark"
      : "light") as "light" | "dark",
    fullscreen: false,
    canMessage: false,
    canContext: false,
    canDownload: false,
  });
  const app = useMemo(
    () =>
      new App(
        { name: "VibeScroll", version: "0.1.0" },
        {},
        { autoResize: true },
      ),
    [],
  );
  const extensions = useMemo(() => new OpenAIExtensions(app), [app]);
  useEffect(() => {
    let active = true;
    const context = () => {
      if (!active) return;
      const current = app.getHostContext();
      if (current?.theme) applyDocumentTheme(current.theme);
      if (current?.styles?.variables)
        applyHostStyleVariables(current.styles.variables);
      for (const edge of ["top", "right", "bottom", "left"] as const) {
        const inset = current?.safeAreaInsets?.[edge] ?? 0;
        document.documentElement.style.setProperty(
          `--vibescroll-safe-${edge}`,
          `${Math.max(0, Math.min(200, inset))}px`,
        );
      }
      const route = parseAppRoute(extensions.deepLink.getCurrent()?.url);
      setState((old) => ({
        ...old,
        theme: current?.theme === "dark" ? "dark" : "light",
        fullscreen: current?.displayMode === "fullscreen",
        ...(route && JSON.stringify(route) !== JSON.stringify(old.route)
          ? { route }
          : {}),
      }));
    };
    app.ontoolresult = (result) => {
      if (!active) return;
      try {
        const payload = decodeToolResult(result as ToolResult);
        const metadata = (result as { _meta?: Record<string, unknown> })
          ._meta?.["vibescroll/widget"] as
          { route?: unknown; input?: ToolRecord } | undefined;
        const card = metadata?.route
          ? widgetRoute.safeParse(metadata.route)
          : null;
        if (card?.success) payload.route = card.data;
        setState((old) => ({
          ...old,
          payload,
          ...(metadata?.input ? { input: metadata.input } : {}),
          initialPending: false,
          error: "",
        }));
      } catch (error) {
        setState((old) => ({
          ...old,
          payload: null,
          initialPending: false,
          error:
            error instanceof Error
              ? error.message
              : "The result could not be read.",
        }));
      }
    };
    app.ontoolinput = async (params) => {
      if (active)
        setState((old) => ({
          ...old,
          input: (params.arguments ?? {}) as ToolRecord,
          initialPending: true,
          payload: null,
          error: "",
        }));
      const file = params.arguments?.file as
        { resourceUri?: string } | undefined;
      if (
        !file?.resourceUri ||
        file.resourceUri.length > 4096 ||
        !extensions.resources
      )
        return;
      try {
        const resource = await extensions.resources.read({
          uri: file.resourceUri,
        });
        const content = resource.contents[0];
        if (
          !content ||
          !("text" in content) ||
          typeof content.text !== "string" ||
          new TextEncoder().encode(content.text).length > 262144
        )
          throw new Error("Open a text snapshot smaller than 256 KiB.");
        const snapshot = widgetExport.parse(JSON.parse(content.text));
        if (active)
          setState((old) => ({
            ...old,
            payload: { export_snapshot: snapshot },
          }));
      } catch {
        if (active)
          setState((old) => ({
            ...old,
            error:
              "This file is not a valid bounded VibeScroll snapshot. Choose a .vibescroll export in the viewer.",
          }));
      }
    };
    app.addEventListener("hostcontextchanged", context);
    app.onteardown = () => {
      active = false;
      return {};
    };
    if (isDemo) {
      // eslint-disable-next-line react/set-state-in-effect -- Synchronize the external preview host bridge.
      setState((old) => ({
        ...old,
        ready: true,
        fullscreen:
          new URLSearchParams(location.search).get("display") !== "inline",
        canMessage: true,
        canContext: true,
        canDownload: true,
      }));
      if (document.documentElement.dataset.entry === "card") {
        void import("./preview-data").then(({ demoCardPayload }) => {
          if (active) setState((old) => ({ ...old, payload: demoCardPayload }));
        });
      }
    } else if (window.parent === window) {
      setState((old) => ({
        ...old,
        error:
          "Open this widget from your connected VibeScroll plugin in ChatGPT or Codex. It does not connect using browser cookies.",
      }));
    } else {
      app
        .connect(undefined, { timeout: 10000 })
        .then(() => {
          if (!active) return;
          const capabilities = app.getHostCapabilities();
          setState((old) => ({
            ...old,
            ready: true,
            error: "",
            canMessage: !!capabilities?.message,
            canContext: !!capabilities?.updateModelContext,
            canDownload: !!capabilities?.downloadFile,
          }));
          context();
        })
        .catch(() => {
          if (active)
            setState((old) => ({
              ...old,
              error:
                "The host could not initialize this widget. Refresh the plugin or use the protected VibeScroll website.",
            }));
        });
    }
    return () => {
      active = false;
      app.removeEventListener("hostcontextchanged", context);
      void app.close();
    };
  }, [app, extensions]);
  const host: Host = {
    ...state,
    demo: isDemo,
    readImage: async (name, args) => {
      if (!state.ready || isDemo)
        throw new Error("A retained frame is unavailable in this preview.");
      const result = await app.callServerTool(
        { name, arguments: args },
        { timeout: 25000 },
      );
      if (result.isError) {
        decodeToolResult(result as ToolResult);
        throw new Error("This frame is unavailable.");
      }
      const frame = result.content?.find((item) => item.type === "image");
      if (
        !frame ||
        frame.type !== "image" ||
        frame.mimeType !== "image/jpeg" ||
        frame.data.length > 8388608 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(frame.data)
      )
        throw new Error("The retained frame could not be read.");
      return `data:image/jpeg;base64,${frame.data}`;
    },
    call: async (name, args) => {
      if (isDemo) return (await import("./preview-data")).demoCall(name, args);
      if (!state.ready) throw new Error("The plugin connection is not ready.");
      const result = await app.callServerTool(
        { name, arguments: args },
        { timeout: 25000 },
      );
      try {
        return decodeToolResult(result as ToolResult);
      } catch (error) {
        // Preserve a safe machine-readable refusal without exposing raw tool logs.
        const response = result as ToolResult;
        let code: unknown;
        try {
          const body =
            response.structuredContent ??
            JSON.parse(
              response.content?.find((item) => item.type === "text")?.text ??
                "{}",
            );
          code =
            body && typeof body === "object" && "code" in body
              ? body.code
              : undefined;
        } catch {
          /* The existing decoder owns malformed-result errors. */
        }
        if (error instanceof Error && typeof code === "string")
          Object.assign(error, { code });
        throw error;
      }
    },
    open: async (value) => {
      const url = safeAppUrl(value);
      if (!url)
        throw new Error("That destination is not an approved VibeScroll page.");
      if (isDemo) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      const result = await app.openLink({ url });
      if (result.isError)
        throw new Error(
          "The host did not open the link. Copy the protected VibeScroll URL instead.",
        );
    },
    message: async (text) => {
      if (text.length > 12000)
        throw new Error(
          "Select less content before sending it to the conversation.",
        );
      if (isDemo) return;
      if (!state.canMessage)
        throw new Error(
          "This host cannot send a follow-up from the widget. Copy the request into the conversation.",
        );
      const result = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text }],
      });
      if (result.isError)
        throw new Error(
          "The host did not accept the message. Copy it into the conversation.",
        );
    },
    attach: async (text, data) => {
      if (text.length > 12000)
        throw new Error("Select fewer insights to attach.");
      if (isDemo) return;
      if (!state.canContext)
        throw new Error(
          "This host cannot attach widget context. Copy the selected citations into the conversation.",
        );
      await app.updateModelContext({
        content: [{ type: "text", text }],
        ...(data ? { structuredContent: data } : {}),
      });
    },
    expand: async () => {
      if (isDemo) setState((old) => ({ ...old, fullscreen: true }));
      else {
        const result = await app.requestDisplayMode({ mode: "fullscreen" });
        if (result.mode !== "fullscreen")
          throw new Error(
            "This host cannot open the full view. Continue in VibeScroll.",
          );
        contextDisplayMode(result.mode);
      }
    },
    download: async (text) => {
      if (new TextEncoder().encode(text).length > 262144)
        throw new Error(
          "Select fewer insights for a snapshot smaller than 256 KiB.",
        );
      if (isDemo) {
        const url = URL.createObjectURL(
          new Blob([text], { type: "application/vnd.vibescroll+json" }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "selected-insights.vibescroll";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
      }
      if (!state.canDownload) return false;
      try {
        const result = await app.downloadFile({
          contents: [
            {
              type: "resource",
              resource: {
                uri: "file:///selected-insights.vibescroll",
                mimeType: "application/vnd.vibescroll+json",
                text,
              },
            },
          ],
        });
        return !result.isError;
      } catch {
        return false;
      }
    },
  };
  function contextDisplayMode(mode: string) {
    setState((old) => ({ ...old, fullscreen: mode === "fullscreen" }));
  }
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}
export function useHost() {
  const host = useContext(HostContext);
  if (!host) throw new Error("Widget host missing");
  return host;
}
