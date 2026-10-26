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
  route: WidgetRoute | null;
  theme: "light" | "dark";
  fullscreen: boolean;
  canMessage: boolean;
  canContext: boolean;
  canDownload: boolean;
  call: (name: string, args: ToolRecord) => Promise<ToolRecord>;
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
      const route = parseAppRoute(extensions.deepLink.getCurrent()?.url);
      setState((old) => ({
        ...old,
        theme: current?.theme === "dark" ? "dark" : "light",
        fullscreen: current?.displayMode === "fullscreen",
        ...(route ? { route } : {}),
      }));
    };
    app.ontoolresult = (result) => {
      if (!active) return;
      try {
        const payload = decodeToolResult(result as ToolResult);
        const metadata = (result as { _meta?: Record<string, unknown> })
          ._meta?.["vibescroll/widget"] as { route?: unknown } | undefined;
        const card = metadata?.route
          ? widgetRoute.safeParse(metadata.route)
          : null;
        if (card?.success) payload.route = card.data;
        setState((old) => ({ ...old, payload, error: "" }));
      } catch (error) {
        setState((old) => ({
          ...old,
          payload: null,
          error:
            error instanceof Error
              ? error.message
              : "The result could not be read.",
        }));
      }
    };
    app.ontoolinput = async (params) => {
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
        fullscreen: true,
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
    call: async (name, args) => {
      if (isDemo) return (await import("./preview-data")).demoCall(name, args);
      if (!state.ready) throw new Error("The plugin connection is not ready.");
      const result = await app.callServerTool(
        { name, arguments: args },
        { timeout: 25000 },
      );
      return decodeToolResult(result as ToolResult);
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
      if (!isDemo) await app.requestDisplayMode({ mode: "fullscreen" });
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
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}
export function useHost() {
  const host = useContext(HostContext);
  if (!host) throw new Error("Widget host missing");
  return host;
}
