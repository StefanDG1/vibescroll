import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startPolling } from "../packages/browser/polling";
let page: EventTarget & { visibilityState: string }, browser: EventTarget;
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  browser = new EventTarget();
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", browser);
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("stops hidden/offline polling and refreshes immediately when the page returns", async () => {
  const read = vi.fn(async () => {});
  cleanups.push(startPolling(read, 15000));
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(1);
  page.visibilityState = "hidden";
  page.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(1);
  page.visibilityState = "visible";
  page.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  vi.stubGlobal("navigator", { onLine: false });
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(2);
  vi.stubGlobal("navigator", { onLine: true });
  browser.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(3);
});
it("allows one request at a time and never schedules more work after unmount", async () => {
  let resolve: (() => void) | undefined;
  const read = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const stop = startPolling(read, 10000);
  cleanups.push(stop);
  await vi.advanceTimersByTimeAsync(0);
  browser.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(1);
  stop();
  resolve!();
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(1);
});
it("backs off failed reads and restores the normal cadence after success", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValue(undefined);
  cleanups.push(startPolling(read, 10000));
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(19999);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(40000);
  expect(read).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(10000);
  expect(read).toHaveBeenCalledTimes(4);
});
it("keeps an already loaded idle source quiet while preserving visibility and reconnect refresh", async () => {
  const read = vi.fn(async () => {});
  cleanups.push(startPolling(read, null, false));
  await vi.advanceTimersByTimeAsync(300000);
  expect(read).not.toHaveBeenCalled();
  page.visibilityState = "hidden";
  page.dispatchEvent(new Event("visibilitychange"));
  page.visibilityState = "visible";
  page.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(300000);
  expect(read).toHaveBeenCalledTimes(1);
  browser.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
});
it("starts active source polling after its interval without duplicating the authoritative initial read", async () => {
  const read = vi.fn(async () => {});
  cleanups.push(startPolling(read, 15000, false));
  await vi.advanceTimersByTimeAsync(14999);
  expect(read).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15000);
  expect(read).toHaveBeenCalledTimes(2);
});
it("does not dispatch a mount read when navigation replaces a wake-only source with an already loaded page", async () => {
  const read = vi.fn(async () => {});
  const source = startPolling(read, null, false);
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).not.toHaveBeenCalled();
  source();
  cleanups.push(startPolling(read, 60000, false));
  await vi.advanceTimersByTimeAsync(0);
  expect(read).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(1);
});
