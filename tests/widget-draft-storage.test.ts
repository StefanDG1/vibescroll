import { expect, it, vi } from "vitest";
import {
  widgetDraftStorage,
  type WidgetStateBridge,
} from "../apps/widget/src/widget-draft-storage";
import { ProposalDraftMemory } from "../apps/starter/lib/proposal-draft-memory";

it("keeps draft text and pending keys private across a supported widget reload without changing outer state", () => {
  const host: WidgetStateBridge = {
    widgetState: {
      modelContent: "Keep original model context",
      imageIds: ["existing-upload"],
      other: 2,
      privateContent: { otherApp: "preserved" },
    },
  };
  host.setWidgetState = vi.fn((state) => {
    host.widgetState = state;
  });
  const first = widgetDraftStorage(() => host);
  first.setItem("actor:plan", "Unsent private text");
  first.setItem(
    "actor:plan:request",
    JSON.stringify({
      operation: "proposalComment",
      args: { key: "same-original-key", text: "Original feedback" },
    }),
  );
  const afterReload = widgetDraftStorage(() => host);
  expect(afterReload.getItem("actor:plan")).toBe("Unsent private text");
  expect(JSON.parse(afterReload.getItem("actor:plan:request")!).args.key).toBe(
    "same-original-key",
  );
  expect(host.widgetState).toMatchObject({
    modelContent: "Keep original model context",
    imageIds: ["existing-upload"],
    other: 2,
    privateContent: { otherApp: "preserved" },
  });
  expect(
    JSON.stringify((host.widgetState as Record<string, unknown>).modelContent),
  ).not.toContain("Unsent private text");
  afterReload.removeItem("actor:plan");
  afterReload.removeItem("actor:plan:request");
  expect(afterReload.getItem("actor:plan:request")).toBeNull();
});
it("bounds private widget state and never replaces another private-content format or silently writes through a throwing host", () => {
  const host: WidgetStateBridge = {
    widgetState: { privateContent: {} },
    setWidgetState: (state) => {
      host.widgetState = state;
    },
  };
  const storage = widgetDraftStorage(() => host);
  for (let i = 0; i < 45; i++) storage.setItem(`actor:${i}`, "draft");
  expect(storage.getItem("actor:0")).toBeNull();
  expect(storage.getItem("actor:44")).toBe("draft");
  host.widgetState = { privateContent: "another format" };
  expect(() => storage.setItem("actor:plan", "draft")).toThrow(
    "another format",
  );
  host.widgetState = {};
  host.setWidgetState = () => {
    throw new DOMException("Unavailable", "SecurityError");
  };
  expect(() => storage.setItem("actor:plan", "draft")).toThrow("Unavailable");
  expect(() => storage.getItem("actor:44")).toThrow("unavailable");
  expect(() =>
    widgetDraftStorage(() => undefined).getItem("actor:plan"),
  ).toThrow("unavailable");
});
it("bounds the volatile LRU while keeping exact pending requests ahead of ordinary text and isolating actors", () => {
  const memory = new ProposalDraftMemory(2);
  memory.draft("actor-a:plan", "First draft");
  const request = {
    operation: "proposalComment",
    args: { proposalId: "plan", key: "original-key", text: "Feedback" },
  };
  memory.request("actor-b:plan", request);
  request.args.key = "changed outside the store";
  memory.draft("actor-c:plan", "Newest draft");
  expect(memory.read("actor-a:plan")).toBeUndefined();
  expect(memory.read("actor-b:plan")?.pending?.args.key).toBe("original-key");
  memory.request("actor-c:plan", {
    ...request,
    args: { ...request.args, key: "second-key" },
  });
  expect(
    memory.draft("actor-d:plan", "Cannot evict an uncertain request"),
  ).toBe(false);
  memory.clear("actor-b:plan");
  expect(memory.read("actor-b:plan")).toBeUndefined();
});
