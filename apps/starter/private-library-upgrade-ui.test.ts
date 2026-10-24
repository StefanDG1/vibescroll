import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const hooks = vi.hoisted(() => ({
  cells: [] as any[],
  index: 0,
  refresh: vi.fn(),
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useState: (initial: any) => {
      const i = hooks.index++;
      if (!(i in hooks.cells)) hooks.cells[i] = initial;
      return [
        hooks.cells[i],
        (value: any) => {
          hooks.cells[i] = value;
        },
      ];
    },
    useRef: (initial: unknown) =>
      (hooks.cells[hooks.index++] ??= { current: initial }),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: hooks.refresh }),
}));
import { PrivateLibraryUpgradePanel } from "./components/private-library-upgrade";
type Node = ReactElement<Record<string, any>>;
const now = 1_800_000_000_000;
const organizationId = "fixture-workspace";
const preview = {
  organizationId,
  organizationName: "Fixture workspace",
  membershipId: "fixture-owner",
  eligible: true,
  reason: "eligible",
  expectedVersion: "exact-current-version",
  previewedAt: now,
  expiresAt: now + 60000,
  preservesPosts: true,
  preservesProjects: true,
  teamInvitationsDisabled: true,
};
function render() {
  hooks.index = 0;
  return PrivateLibraryUpgradePanel({ organizationId });
}
function elements(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...elements(node.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isValidElement(value)) return text((value as Node).props.children);
  return typeof value === "string" ? value : "";
}
function button(name: string) {
  const found = elements(render()).find(
    (n) => n.type === "button" && text(n) === name,
  );
  expect(found, name).toBeDefined();
  return found!;
}
function check() {
  return elements(render()).find(
    (n) => n.type === "input" && n.props.type === "checkbox",
  );
}
function ack() {
  check()!.props.onChange({ target: { checked: true } });
}
const review = () => button("Review private-library upgrade").props.onClick();
const adopt = () => button("Make this library private").props.onClick();
function response(result: unknown, status = 200) {
  return new Response(
    JSON.stringify(status === 200 ? { result } : { error: result }),
    { status },
  );
}
function server(result: unknown = preview) {
  const fetch = vi.fn().mockImplementation(async () => response(result));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
beforeEach(() => {
  hooks.cells = [];
  hooks.refresh.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("mounts without requests or automatic approval and requires a fresh explicit review and unchecked acknowledgement", async () => {
  const fetch = server();
  render();
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetch).not.toHaveBeenCalled();
  expect(check()).toBeUndefined();
  vi.setSystemTime(now);
  await review();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    operation: "previewPrivateAdoption",
    args: { organizationId },
  });
  expect(check()!.props.checked).toBe(false);
  expect(button("Make this library private").props.disabled).toBe(true);
  await adopt();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("sends only the reviewed version and timestamp after explicit acknowledgement and refreshes after completion", async () => {
  const fetch = server();
  await review();
  ack();
  fetch.mockResolvedValueOnce(response({ organizationId, status: "adopted" }));
  await adopt();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    operation: "adoptPrivateLibrary",
    args: {
      organizationId,
      expectedVersion: preview.expectedVersion,
      previewedAt: preview.previewedAt,
      acknowledgePrivateOnly: true,
    },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(hooks.refresh).toHaveBeenCalledOnce();
  expect(text(render())).toContain("Your library is now private");
  expect(check()).toBeUndefined();
});
it.each(["expired", "foreign", "future"])(
  "refuses a %s review response without offering acknowledgement",
  async (kind) => {
    const value = { ...preview };
    if (kind === "expired") value.expiresAt = now;
    if (kind === "foreign") value.organizationId = "foreign-workspace";
    if (kind === "future") value.previewedAt = now + 1;
    const fetch = server(value);
    await review();
    expect(check()).toBeUndefined();
    expect(text(render())).toContain("workspace review changed");
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it("refuses an already displayed review after expiry and clears acknowledgement", async () => {
  const fetch = server();
  await review();
  ack();
  vi.setSystemTime(preview.expiresAt);
  await adopt();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(check()).toBeUndefined();
  expect(text(render())).toContain("This review expired");
});
it("clears acknowledgement after backend failure and requires a new review", async () => {
  const fetch = server();
  await review();
  ack();
  fetch.mockResolvedValueOnce(
    response("Workspace changed. Review again.", 409),
  );
  await adopt();
  expect(check()).toBeUndefined();
  expect(text(render())).toContain("Workspace changed. Review again.");
  await review();
  expect(check()!.props.checked).toBe(false);
  expect(button("Make this library private").props.disabled).toBe(true);
});
it("blocks duplicate review and adoption events while requests remain in flight", async () => {
  let release!: (value: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const reviewClick = button("Review private-library upgrade").props.onClick;
  const first = reviewClick();
  await reviewClick();
  expect(fetch).toHaveBeenCalledTimes(1);
  release(response(preview));
  await first;
  ack();
  const adoptClick = button("Make this library private").props.onClick;
  const second = adoptClick();
  await adoptClick();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(check()!.props.disabled).toBe(true);
  release(response({ organizationId, status: "adopted" }));
  await second;
  expect(hooks.refresh).toHaveBeenCalledOnce();
});
