// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
const mock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../apps/starter/node_modules/posthog-js/no-external", () => ({
  default: { init: mock.init },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});
it("never initializes or captures before consent and drops SDK defaults after consent", async () => {
  vi.stubGlobal("navigator", { doNotTrack: "0" });
  const document = {
    cookie: `vs_consent=${encodeURIComponent(JSON.stringify({ revision: 2, categories: ["necessary", "analytics"] }))}`,
  };
  vi.stubGlobal("document", document);
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  const browser = Object.assign(new EventTarget(), {
    sessionStorage: {
      getItem: (key: string) => session.get(key),
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
    },
    localStorage: {
      getItem: (key: string) => local.get(key),
      setItem: (key: string, value: string) => local.set(key, value),
      removeItem: (key: string) => local.delete(key),
    },
    location: {
      search: "?utm_source=community",
      hostname: "scroll.companynerve.com",
    },
  });
  vi.stubGlobal("window", browser);
  const persistedId = crypto.randomUUID();
  session.set("vibescroll.analytics.journey", persistedId);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_SyntheticPublicTest");
  let config: any;
  mock.init.mockImplementation((_key, opts) => {
    config = opts;
    return mock;
  });
  expect(process.env.NEXT_PUBLIC_POSTHOG_KEY).toBe("phc_SyntheticPublicTest");
  expect(navigator.doNotTrack).toBe("0");
  const analytics = await import("../apps/starter/lib/analytics");
  analytics.track("source_viewed", { title: "private" });
  expect(mock.init).not.toHaveBeenCalled();
  expect(mock.capture).not.toHaveBeenCalled();
  const initialization = analytics.setAnalyticsConsent(true);
  browser.location.search = "?example=1";
  expect(
    analytics.track("public_cta_clicked", { cta: "try_example", page: "home" }),
  ).toBe(true);
  await initialization;
  expect(mock.capture).toHaveBeenCalledWith("public_cta_clicked", {
    schema_version: "1",
    cta: "try_example",
    page: "home",
  });
  mock.capture.mockClear();
  expect(mock.init).toHaveBeenCalledTimes(1);
  expect(config.autocapture).toBe(false);
  expect(config.capture_pageview).toBe(false);
  expect(config.disable_session_recording).toBe(true);
  expect(config.persistence).toBe("memory");
  const result = config.before_send({
    uuid: "uuid",
    event: "source_viewed",
    timestamp: new Date(),
    properties: {
      distinct_id: "random",
      kind: "text",
      state: "ready",
      coverage: "caption_only",
      $current_url: "private-url",
      email: "private",
      $referrer: "private",
      token: "wrong",
    },
    $set: { email: "private" },
  });
  expect(result.properties).toEqual({
    schema_version: "1",
    kind: "text",
    state: "ready",
    coverage: "caption_only",
    distinct_id: persistedId,
    journey_version: "2",
    environment: "production",
    campaign: "community",
    $process_person_profile: false,
    $geoip_disable: true,
    token: "phc_SyntheticPublicTest",
  });
  expect(result.$set).toBeUndefined();
  expect(
    config.before_send({
      event: "$autocapture",
      properties: { distinct_id: "random" },
    }),
  ).toBeNull();
  analytics.track("source_viewed", { kind: "text", title: "private" });
  expect(mock.capture).toHaveBeenCalledTimes(1);
  expect(local.size).toBe(0);
  analytics.track("citation_inspected", { kind: "frame" });
  const engagement = local.get("vibescroll.analytics.engagement");
  expect(engagement?.startsWith(persistedId)).toBe(true);
  expect(Number(engagement?.split(":")[1]) - Date.now()).toBeLessThanOrEqual(
    7 * 24 * 60 * 60_000,
  );
  // A withdrawal in another tab must stop events before the polling callback.
  document.cookie = `vs_consent=${encodeURIComponent(JSON.stringify({ revision: 2, categories: ["necessary"] }))}`;
  expect(analytics.track("source_viewed", { kind: "text" })).toBe(false);
  expect(
    config.before_send({
      event: "source_viewed",
      properties: { distinct_id: "random" },
    }),
  ).toBeNull();
  await analytics.setAnalyticsConsent(false);
  expect(session.size).toBe(0);
  expect(local.size).toBe(0);
  expect(mock.reset).toHaveBeenCalledTimes(1);
  analytics.track("source_viewed", { kind: "text" });
  expect(mock.capture).toHaveBeenCalledTimes(2);
  expect(
    config.before_send({
      event: "source_viewed",
      properties: { distinct_id: "random" },
    }),
  ).toBeNull();
});
it("honors browser privacy signals even with stored consent", async () => {
  vi.stubGlobal("navigator", { doNotTrack: "1" });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_SyntheticPublicTest");
  const analytics = await import("../apps/starter/lib/analytics");
  await analytics.setAnalyticsConsent(true);
  expect(mock.init).not.toHaveBeenCalled();
  vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: true });
  await analytics.setAnalyticsConsent(true);
  expect(mock.init).not.toHaveBeenCalled();
});
