import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { widgetResources } from "../../../packages/widget/resources.generated";
import { demoCall, seedDemoFeedback } from "../src/preview-data";
import type { ToolRecord } from "../../../packages/widget/contracts";
import {
  widgetVersion,
  inlineCardRoute,
} from "../../../packages/widget/contracts";

if (!import.meta.env.DEV)
  throw new Error("The protocol harness is development-only.");
const css = document.createElement("style");
css.textContent =
  "body{margin:0;font:14px system-ui;background:#f4f4f4;color:#202123}header{padding:16px;border-bottom:1px solid #ddd}header p{margin:6px 0 12px}button,select{font:inherit;padding:7px;margin-right:8px}output{margin-left:8px}iframe{display:block;border:0;width:100%;height:900px;background:white}details{padding:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}";
document.head.append(css);
const frame = document.querySelector<HTMLIFrameElement>("#widget")!;
const resource = document.querySelector<HTMLSelectElement>("#resource")!;
const options = new URLSearchParams(location.search);
if (["workspace", "card", "export"].includes(options.get("resource") ?? ""))
  resource.value = options.get("resource")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const receipt = document.querySelector<HTMLPreElement>("#receipts")!;
type Receipt = {
  event: string;
  url?: string;
  name?: string;
  source?: string;
  profile?: string;
};
const receipts: Receipt[] = [];
function record(event: string, data: Omit<Receipt, "event"> = {}) {
  receipts.push({ event, ...data });
  receipt.textContent = JSON.stringify(receipts, null, 2);
  status.textContent = `${receipts.length} protocol receipts`;
}
let bridge: AppBridge | undefined;
let revoked = false;
const denyDownload =
  new URLSearchParams(location.search).get("download") === "deny";
let theme: "light" | "dark" =
  options.get("theme") === "dark" ? "dark" : "light";
let session = 0;
async function load() {
  const current = ++session;
  if (bridge) await bridge.close();
  receipts.length = 0;
  revoked = false;
  const kind = resource.value as keyof typeof widgetResources;
  frame.style.maxWidth = kind === "card" ? "680px" : "none";
  frame.style.height = kind === "card" ? "100px" : "900px";
  frame.style.margin = kind === "card" ? "20px auto" : "0";
  const next = new AppBridge(
    null,
    { name: "VibeScroll protocol harness", version: "1" },
    {
      ...(kind === "export" ? { experimental: { "openai/resource": {} } } : {}),
      serverTools: {},
      serverResources: {},
      openLinks: {},
      downloadFile: {},
      ...(options.get("messages") === "0" ? {} : { message: { text: {} } }),
      ...(options.get("context") === "0"
        ? {}
        : { updateModelContext: { text: {}, structuredContent: {} } }),
    },
    {
      hostContext: {
        theme,
        displayMode: kind === "workspace" ? "fullscreen" : "inline",
        availableDisplayModes: ["inline", "fullscreen"],
      },
    },
  );
  bridge = next;
  let initialized = false;
  let feedbackReads = 0;
  let feedbackReplyLost = false;
  if (options.get("feedback-saved") === "1") seedDemoFeedback();
  let editReplyLost = false;
  let filingReplyLost = false;
  next.addEventListener("sizechange", ({ height }) => {
    if (initialized && height)
      frame.style.height = `${Math.min(2000, Math.max(100, height))}px`;
  });
  next.oncalltool = async ({ name, arguments: args }) => {
    record("tool", {
      name,
      source: typeof args?.id === "string" ? args.id : undefined,
      profile: typeof args?.profileId === "string" ? args.profileId : undefined,
    });
    if (revoked)
      return {
        isError: true,
        content: [{ type: "text", text: "Synthetic grant revoked" }],
      };
    const data = await demoCall(name, (args ?? {}) as ToolRecord);
    if (name === "widget_feedback_state") {
      feedbackReads++;
      if (options.get("feedback-authority-change") === "1" && feedbackReads > 1)
        data.authority_id = "another-feedback-grant";
      if (options.get("feedback-limited") === "1") {
        data.lookup_complete = false;
        data.feedback = null;
      }
    }
    if (name === "record_feedback" && options.get("feedback-delay") === "1")
      await new Promise((resolve) => setTimeout(resolve, 1200));
    if (
      name === "record_feedback" &&
      options.get("feedback-lost-reply") === "1" &&
      !feedbackReplyLost
    ) {
      feedbackReplyLost = true;
      return {
        isError: true,
        content: [
          { type: "text", text: "Synthetic reply lost after saved judgment" },
        ],
      };
    }
    if (name === "widget_state" && options.get("feedback") === "0")
      (data.actions as ToolRecord).feedback = false;
    if (
      name === "widget_evidence_state" &&
      options.get("filing-empty-page") === "1" &&
      !args?.cursor
    ) {
      data.items = [];
      data.next_cursor = "synthetic-next-filing-page";
    }
    if (name === "widget_evidence_edit" && options.get("filing-delay") === "1")
      await new Promise((resolve) => setTimeout(resolve, 1200));
    if (
      name === "widget_evidence_edit" &&
      options.get("filing-lost-reply") === "1" &&
      !filingReplyLost
    ) {
      filingReplyLost = true;
      return {
        isError: true,
        content: [
          { type: "text", text: "Synthetic reply lost after committed filing" },
        ],
      };
    }
    if (name === "widget_library_edit" && options.get("edit-delay") === "1")
      await new Promise((resolve) => setTimeout(resolve, 1200));
    if (
      name === "widget_library_edit" &&
      options.get("edit-lost-reply") === "1" &&
      !editReplyLost
    ) {
      editReplyLost = true;
      return {
        isError: true,
        content: [
          { type: "text", text: "Synthetic reply lost after committed edit" },
        ],
      };
    }
    if (name === "widget_state" && options.get("editing") === "0") {
      (data.actions as ToolRecord).organize = false;
    }
    if (
      name === "fetch" &&
      options.get("references") === "5" &&
      typeof data.text === "string"
    ) {
      const source = JSON.parse(data.text);
      if (Array.isArray(source.insights) && source.insights[0]) {
        source.insights[0].evidence = Array.from({ length: 5 }, (_, index) => ({
          kind: "transcript",
          startMs: 1000 + index * 5000,
          endMs: 4000 + index * 5000,
        }));
        data.text = JSON.stringify(source);
      }
    }
    if (
      name === "widget_state" &&
      ["local", "cloud", "save_only"].includes(options.get("preference") ?? "")
    )
      data.processing_route = options.get("preference");
    return {
      structuredContent: data,
      content: [],
    };
  };
  next.onmessage = async () => {
    record("message");
    return {};
  };
  next.onupdatemodelcontext = async () => {
    record("context");
    return {};
  };
  next.onopenlink = async () => {
    record("protected-link");
    return {};
  };
  next.ondownloadfile = async () => {
    record(denyDownload ? "download-denied" : "download");
    return { isError: denyDownload };
  };
  next.onreadresource = async ({ uri }) => {
    record("file-read");
    return {
      contents: [
        {
          uri,
          mimeType: "application/vnd.vibescroll+json",
          text: JSON.stringify({
            schemaVersion: widgetVersion,
            exportedAt: "2026-10-26T00:00:00Z",
            title: "Fixture snapshot",
            sources: [],
          }),
        },
      ],
    };
  };
  next.onrequestdisplaymode = async ({ mode }) => {
    record("display-mode");
    next.setHostContext({ displayMode: mode });
    return { mode };
  };
  next.oninitialized = async () => {
    if (session !== current) return;
    initialized = true;
    record("initialized", { url: location.href });
    if (kind === "card" && options.get("card") !== "status") {
      await next.sendToolInput({
        arguments: {
          profileId: "demo-private-workspace",
          id: "sample-onboarding",
        },
      });
      const value = await demoCall("fetch", { id: "sample-onboarding" });
      await next.sendToolResult({
        structuredContent: { ...value, profile_id: "demo-private-workspace" },
        content: [],
        _meta: {
          "vibescroll/widget": {
            route: inlineCardRoute("fetch", {
              ...value,
              profile_id: "demo-private-workspace",
            }),
          },
        },
      });
      return;
    }
    void next
      .sendToolInput({
        arguments:
          kind === "export"
            ? { file: { resourceUri: "fixture:///selected.vibescroll" } }
            : {},
      })
      .then(() =>
        next.sendToolResult({
          structuredContent: {
            schema_version: "vibescroll-widget-v1",
            route:
              kind === "card"
                ? {
                    view: "save",
                    profileId: "demo-private-workspace",
                    sourceId: "sample-onboarding",
                  }
                : {
                    view:
                      kind === "export"
                        ? "export"
                        : options.get("view") === "scroll"
                          ? "scroll"
                          : options.get("view") === "topics"
                            ? "topics"
                            : "library",
                  },
          },
          content: [],
        }),
      );
  };
  await next.connect(
    new PostMessageTransport(frame.contentWindow!, frame.contentWindow!),
  );
  frame.srcdoc = widgetResources[kind];
}
document.querySelector("#theme")!.addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  bridge?.setHostContext({ theme });
  record("theme");
});
document.querySelector("#revoke")!.addEventListener("click", () => {
  revoked = true;
  record("revoked");
});
document.querySelector("#reload")!.addEventListener("click", () => void load());
resource.addEventListener("change", () => void load());
void load();
