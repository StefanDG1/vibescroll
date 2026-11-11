import { afterEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effect: 0,
  effects: [] as any[],
  receive: undefined as any,
  liveEnabled: [] as boolean[],
}));
vi.mock("./lib/use-source-live", () => ({
  useProposalLive: (_id: string, _enabled: boolean, receive: any) => {
    hooks.liveEnabled.push(_enabled);
    hooks.receive = receive;
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = hooks.index++;
    if (!(i in hooks.cells)) hooks.cells[i] = initial;
    return [
      hooks.cells[i],
      (next: any) => {
        hooks.cells[i] =
          typeof next === "function" ? next(hooks.cells[i]) : next;
      },
    ];
  },
  useRef: (initial: any) =>
    (hooks.cells[hooks.index++] ??= { current: initial }),
  useEffectEvent: (fn: any) => fn,
  useEffect: (run: any, deps: any[]) => {
    const i = hooks.effect++,
      old = hooks.effects[i];
    if (!old || deps.some((d, j) => d !== old.deps[j]))
      hooks.effects[i] = { deps, run };
  },
}));
import { useProposalWork } from "./lib/use-proposal-work";
import { proposalDraftMemory } from "./lib/proposal-draft-memory";
const snapshot = {
  actorId: "owner-a",
  proposalId: "plan-one",
  version: 1,
  review: "unreviewed",
  current: true,
  contextHash: "a".repeat(64),
  body: {},
  messages: { page: [], isDone: true, continueCursor: "" },
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function render(call: any, transport: "web" | "mcp" = "web") {
  hooks.index = 0;
  hooks.effect = 0;
  const value = useProposalWork("plan-one", true, call, transport);
  for (const e of hooks.effects)
    if (e.run) {
      const run = e.run;
      e.run = null;
      e.cleanup = run();
    }
  return value;
}
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
  return data;
}
afterEach(() => {
  for (let i = 0; i < 20; i++) proposalDraftMemory.clear(`occupied:${i}`);
  proposalDraftMemory.clear("vibescroll:proposal-draft:owner-a:plan-one");
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.cells = [];
  hooks.effects = [];
  hooks.receive = undefined;
  hooks.liveEnabled = [];
  vi.unstubAllGlobals();
});
it("does not dispatch when every recovery slot is an uncertain request and persistent storage is denied", async () => {
  for (let i = 0; i < 20; i++)
    proposalDraftMemory.request(`occupied:${i}`, {
      operation: "proposalComment",
      args: {
        proposalId: `plan-${i}`,
        key: `existing-key-${i}`,
        text: "Existing feedback",
      },
    });
  const denied = () => {
    throw new DOMException("Storage denied", "SecurityError");
  };
  vi.stubGlobal("localStorage", {
    getItem: denied,
    setItem: denied,
    removeItem: denied,
  });
  const call = vi.fn(async () => snapshot);
  render(call);
  await flush();
  let value = render(call);
  value.updateDraft("Do not dispatch without recovery");
  value = render(call);
  await value.send();
  value = render(call);
  expect(value.uncertain).toBe(true);
  expect(value.error).toContain("No request was sent");
  expect(call).toHaveBeenCalledTimes(1);
  expect(proposalDraftMemory.read("occupied:0")?.pending?.args.key).toBe(
    "existing-key-0",
  );
});

it("preserves a blocked-storage draft and the identical uncertain request through unmount and reopening", async () => {
  const unavailable = () => {
    throw new DOMException("Storage denied", "SecurityError");
  };
  vi.stubGlobal("localStorage", {
    getItem: unavailable,
    setItem: unavailable,
    removeItem: unavailable,
  });
  let unknown = true;
  const call = vi.fn(async (operation: string) => {
    if (operation === "proposalDiscussion") return snapshot;
    if (unknown) throw Error("Unknown response");
    return { messageId: "saved" };
  });
  render(call);
  await flush();
  let value = render(call);
  value.updateDraft("Preserve this exact feedback");
  value = render(call);
  await value.send();
  const original = call.mock.calls.find(
    ([operation]) => operation === "proposalComment",
  );
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.cells = [];
  hooks.effects = [];
  render(call);
  await flush();
  value = render(call);
  expect(value.draft).toBe("Preserve this exact feedback");
  expect(value.uncertain).toBe(true);
  unknown = false;
  await value.retryPending();
  const attempts = call.mock.calls.filter(
    ([operation]) => operation === "proposalComment",
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(original);
  value = render(call);
  value.updateDraft("Private unsent correction");
  hooks.receive(null);
  expect(
    proposalDraftMemory.read("vibescroll:proposal-draft:owner-a:plan-one"),
  ).toBeUndefined();
});

it("uses visible MCP discussion reads without requesting website realtime or starting generation", async () => {
  storage();
  let tick: (() => void) | undefined;
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("setInterval", (callback: () => void) => {
    tick = callback;
    return 1;
  });
  vi.stubGlobal("clearInterval", vi.fn());
  const call = vi.fn(async (operation: string) => {
    expect(operation).toBe("proposalDiscussion");
    return snapshot;
  });
  render(call, "mcp");
  await flush();
  expect(hooks.liveEnabled.every((enabled) => !enabled)).toBe(true);
  expect(render(call, "mcp").snapshot?.actorId).toBe("owner-a");
  tick?.();
  await flush();
  expect(call).toHaveBeenCalledTimes(2);
  expect(
    call.mock.calls.every(([operation]) => operation === "proposalDiscussion"),
  ).toBe(true);
});
it("retains a lost-reply message and its exact key across reload, then recovers without erasing newer draft text", async () => {
  const data = storage();
  let reject = true;
  const call = vi.fn(async (op: string) => {
    if (op === "proposalDiscussion") return snapshot;
    if (reject) throw Error("Connection lost");
    return { messageId: "saved-one" };
  });
  render(call);
  await flush();
  let value = render(call);
  value.updateDraft("Original feedback");
  value = render(call);
  await value.send();
  value = render(call);
  expect(value.uncertain).toBe(true);
  expect(data.get("vibescroll:proposal-draft:owner-a:plan-one")).toBe(
    "Original feedback",
  );
  const original = call.mock.calls.find(([op]) => op === "proposalComment");
  expect(original).toBeTruthy();
  // Simulate navigation/reload: hooks are new, authenticated browser storage remains.
  hooks.cells = [];
  hooks.effects = [];
  render(call);
  await flush();
  value = render(call);
  value = render(call);
  expect(value.uncertain).toBe(true);
  value.updateDraft("Newer unsent feedback");
  value = render(call);
  reject = false;
  await value.retryPending();
  value = render(call);
  const sends = call.mock.calls.filter(([op]) => op === "proposalComment");
  expect(sends).toHaveLength(2);
  expect(sends[1]).toEqual(sends[0]);
  expect(value.draft).toBe("Newer unsent feedback");
  expect(value.uncertain).toBe(false);
});
it("clears private text and status on live access loss, and does not generate without a quote", async () => {
  const data = storage();
  const call = vi.fn(async () => snapshot);
  render(call);
  await flush();
  let value = render(call);
  value.updateDraft("Private draft");
  value = render(call);
  await value.generate();
  expect(call.mock.calls).toHaveLength(1);
  hooks.receive(null);
  value = render(call);
  expect(value.snapshot).toBeNull();
  expect(value.draft).toBe("");
  expect(data.size).toBe(0);
});

it("sends a paid plan reply through one atomic operation using the current visible credit quote", async () => {
  storage();
  const paid = {
    ...snapshot,
    generatedVersion: 2,
    version: 2,
    discussionRevision: 1,
  };
  const quote = { quoteId: "q".repeat(64), maximumCredits: 3, version: 2 };
  const call = vi.fn(async (op: string) =>
    op === "proposalPlanQuote"
      ? quote
      : op === "proposalDiscussion"
        ? paid
        : { operation: { id: "reply-job" } },
  );
  render(call);
  await flush();
  let value = render(call);
  await flush();
  value = render(call);
  expect(value.quote.maximumCredits).toBe(3);
  value.updateDraft("Simplify the first step.");
  value = render(call);
  await value.send();
  const writes = call.mock.calls.filter(([op]) => op === "proposalReply");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toEqual([
    "proposalReply",
    expect.objectContaining({
      expectedVersion: 2,
      text: "Simplify the first step.",
      quoteId: quote.quoteId,
      maximumCredits: 3,
    }),
  ]);
  expect(
    call.mock.calls.some(
      ([op]) => op === "proposalComment" || op === "proposalPlanStart",
    ),
  ).toBe(false);
});

it("keeps an unclassified rejected HTTP response uncertain and recovers with the original key", async () => {
  const data = storage();
  let unknown = true;
  const call = vi.fn(async (op: string) => {
    if (op === "proposalDiscussion") return snapshot;
    if (unknown)
      throw Object.assign(new Error("Unclassified response"), {
        code: "UNCLASSIFIED",
        outcome: "rejected",
      });
    return { messageId: "confirmed-message" };
  });
  render(call);
  await flush();
  let value = render(call);
  value.updateDraft("Preserve this requested comment.");
  value = render(call);
  await value.send();
  value = render(call);
  expect(value.uncertain).toBe(true);
  expect(value.recovery?.action).toBe("refresh_status");
  expect(data.has("vibescroll:proposal-draft:owner-a:plan-one:request")).toBe(
    true,
  );
  const original = call.mock.calls.find(([op]) => op === "proposalComment");
  unknown = false;
  await value.retryPending();
  const writes = call.mock.calls.filter(([op]) => op === "proposalComment");
  expect(writes).toEqual([original, original]);
});

it("surfaces automatic quote capacity errors and never dispatches a paid reply without its quote", async () => {
  storage();
  const paid = {
    ...snapshot,
    generatedVersion: 2,
    version: 2,
    discussionRevision: 1,
  };
  const call = vi.fn(async (op: string) => {
    if (op === "proposalPlanQuote")
      throw Object.assign(new Error("Capacity unavailable"), {
        code: "BUDGET_EXCEEDED",
        outcome: "rejected",
      });
    return paid;
  });
  render(call);
  await flush();
  render(call);
  await flush();
  let value = render(call);
  expect(value.recovery?.title).toBe("Processing budget unavailable");
  expect(value.error).not.toBe("");
  expect(value.quote).toBeUndefined();
  value.updateDraft("Keep this feedback until a quote is available.");
  value = render(call);
  await value.send();
  expect(call.mock.calls.some(([op]) => op === "proposalReply")).toBe(false);
});

it("clears a proven funding rejection's pending mutation while keeping the unsent draft", async () => {
  const data = storage();
  const call = vi.fn(async (op: string) => {
    if (op === "proposalDiscussion") return snapshot;
    throw Object.assign(new Error("Insufficient credits"), {
      code: "INSUFFICIENT_CREDITS",
      outcome: "rejected",
    });
  });
  render(call);
  await flush();
  let value = render(call);
  value.updateDraft("Preserved requested reply.");
  value = render(call);
  await value.send();
  value = render(call);
  expect(value.uncertain).toBe(false);
  expect(value.recovery?.action).toBe("billing");
  expect(value.draft).toBe("Preserved requested reply.");
  expect(data.has("vibescroll:proposal-draft:owner-a:plan-one:request")).toBe(
    false,
  );
});
