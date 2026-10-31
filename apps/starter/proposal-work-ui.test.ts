import { afterEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  effect: 0,
  effects: [] as any[],
  receive: undefined as any,
}));
vi.mock("./lib/use-source-live", () => ({
  useProposalLive: (_id: string, _enabled: boolean, receive: any) => {
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
function render(call: any) {
  hooks.index = 0;
  hooks.effect = 0;
  const value = useProposalWork("plan-one", true, call);
  for (const e of hooks.effects)
    if (e.run) {
      const run = e.run;
      e.run = null;
      run();
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
  hooks.cells = [];
  hooks.effects = [];
  hooks.receive = undefined;
  vi.unstubAllGlobals();
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
