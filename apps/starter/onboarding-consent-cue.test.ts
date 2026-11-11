import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  effect: undefined as undefined | (() => () => void),
  valid: false,
  categories: [] as string[],
  config: undefined as any,
  analytics: vi.fn(async () => {}),
}));
vi.mock("react", () => ({
  useEffect: (effect: () => () => void) => {
    state.effect = effect;
  },
}));
vi.mock("vanilla-cookieconsent", () => ({
  run: async (config: unknown) => {
    state.config = config;
  },
  validConsent: () => state.valid,
  getCookie: () => ({ revision: 1, categories: state.categories }),
}));
vi.mock("./lib/analytics", () => ({
  setAnalyticsConsent: state.analytics,
  track: vi.fn(),
}));
vi.mock("./lib/analytics-events", () => ({ publicPageEvent: () => undefined }));
import { ConsentProvider } from "./components/consent";
afterEach(() => vi.unstubAllGlobals());
it("waits for a real choice, permits the tour after rejection and does not reopen it on unchanged polling", async () => {
  const browser = Object.assign(new EventTarget(), {
    location: { pathname: "/onboarding" },
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
  vi.stubGlobal("window", browser);
  const cue = vi.fn();
  browser.addEventListener("vibescroll:consent-changed", cue);
  ConsentProvider();
  const cleanup = state.effect!();
  await Promise.resolve();
  await Promise.resolve();
  expect(cue).not.toHaveBeenCalled();
  expect(state.analytics).toHaveBeenLastCalledWith(false);
  state.valid = true;
  state.categories = ["necessary"];
  state.config.onConsent();
  expect(cue).toHaveBeenCalledTimes(1);
  expect(state.analytics).toHaveBeenLastCalledWith(false);
  state.config.onChange();
  expect(cue).toHaveBeenCalledTimes(1);
  state.categories = ["necessary", "analytics"];
  state.config.onChange();
  expect(cue).toHaveBeenCalledTimes(2);
  expect(state.analytics).toHaveBeenLastCalledWith(true);
  cleanup();
});
