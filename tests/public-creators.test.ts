import { afterEach, expect, it, vi } from "vitest";
import {
  publicCreatorFeedEnabled,
  publicProfileLink,
  readPublicInstagramCreatorPage,
  readPublicTikTokCreatorPage,
} from "../packages/social/public-creators";

afterEach(() => vi.unstubAllEnvs());
const now = Date.UTC(2026, 10, 26);
const user = {
  id: "123456789",
  uniqueId: "creator",
  secUid: "MS4wLjABAAAA" + "a".repeat(32),
  privateAccount: false,
  ins_id: "creator_ig",
};
function tiktokTraffic(override: Record<string, unknown> = {}) {
  return vi.fn(async (url: string | URL | Request) =>
    String(url).includes("/api/")
      ? Response.json({
          statusCode: 0,
          hasMorePrevious: true,
          itemList: [
            {
              id: "7553302113757990166",
              createTime: now / 1000 - 3600,
              author: user,
              imagePost: { images: [{}, {}] },
              ...override,
            },
          ],
        })
      : new Response(
          `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.user-detail": { userInfo: { user } } } })}</script>`,
        ),
  );
}

it("discovers complete TikTok photo metadata without cookies and advances the legacy time cursor", async () => {
  const transport = tiktokTraffic();
  const result = await readPublicTikTokCreatorPage(
    { creatorKey: "tiktok:123456789", handle: "creator" },
    null,
    transport as typeof fetch,
    now,
  );
  expect(result.posts).toEqual([
    {
      postKey: "tiktok:7553302113757990166",
      url: "https://www.tiktok.com/@creator/photo/7553302113757990166",
      publishedAt: now - 3600000,
      durationMs: 0,
    },
  ]);
  expect(result.nextCursor).toBe(now - 3600000);
  expect(result.profile.links).toEqual([
    "https://www.instagram.com/creator_ig/",
  ]);
  expect(String(transport.mock.calls[1][0])).toContain(`cursor=${now}`);
  expect(String(transport.mock.calls[1][0])).toContain("count=15");
  expect(
    transport.mock.calls.every(
      (call) => !JSON.stringify(call).includes("Cookie"),
    ),
  ).toBe(true);
});

it.each([
  { author: { ...user, id: "999" } },
  { privateItem: true },
  { createTime: now / 1000 + 3600 },
])(
  "rejects a conflicting or unavailable TikTok post before discovery: %j",
  async (change) => {
    await expect(
      readPublicTikTokCreatorPage(
        { creatorKey: "tiktok:123456789", handle: "creator" },
        null,
        tiktokTraffic(change) as typeof fetch,
        now,
      ),
    ).rejects.toThrow(/IDENTITY_CHANGED/);
  },
);

function instagramSession() {
  const at = Date.now();
  vi.stubEnv(
    "VIBESCROLL_INSTAGRAM_PROFILE_SESSION_JSON",
    JSON.stringify({
      version: "instagram-public-profile-session-v1",
      accountHandle: "service",
      accountId: "111",
      cookie: "ds_user_id=111; sessionid=synthetic; csrftoken=fixture",
      csrf: "fixture",
      dtsg: "synthetic-token",
      lsd: "fixture",
      jazoest: "21234",
      userAgent: "Synthetic test client",
      capturedAt: at - 1000,
      expiresAt: at + 86400000,
    }),
  );
}
it.each([1, 8])(
  "uses the authenticated current Instagram protocol and photo type %i with strict cookie scoping",
  async (mediaType) => {
    instagramSession();
    const traffic = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url) === "https://www.instagram.com/") {
          expect(new Headers(init?.headers).get("Cookie")).toContain(
            "sessionid=synthetic",
          );
          return new Response(
            '<script type="application/json">{"define":[["DTSGInitialData",[],{"token":"fresh-synthetic-token"}],["LSD",[],{"token":"fresh-lsd"}]]}</script>',
          );
        }
        expect(String(url)).toBe("https://www.instagram.com/api/graphql");
        expect(init?.redirect).toBe("error");
        const h = new Headers(init?.headers),
          p = new URLSearchParams(String(init?.body)),
          variables = JSON.parse(p.get("variables")!);
        expect(h.get("Sec-Fetch-Site")).toBe("same-origin");
        expect(h.get("Cookie")).toContain("sessionid=synthetic");
        expect(p.get("fb_dtsg")).toBe("fresh-synthetic-token");
        expect(h.get("X-FB-LSD")).toBe("fresh-lsd");
        if (
          p.get("fb_api_req_friendly_name") === "PolarisProfilePageContentQuery"
        ) {
          expect(variables.id).toBe("123456789");
          return Response.json({
            data: {
              user: {
                id: "123456789",
                username: "creator",
                is_private: false,
                bio_links: [{ url: "https://www.tiktok.com/@creator" }],
              },
              viewer: { user: { id: "111", username: "service" } },
            },
          });
        }
        expect(variables.username).toBe("creator");
        expect(
          variables.__relay_internal__pv__PolarisSEOIsCrawlerrelayprovider,
        ).toBe(false);
        return Response.json({
          data: {
            xdt_api__v1__feed__user_timeline_graphql_connection: {
              edges: [
                {
                  node: {
                    code: "Photo00001",
                    taken_at: now / 1000 - 3600,
                    user: { pk: "123456789", username: "creator" },
                    media_type: mediaType,
                    ...(mediaType === 8
                      ? {
                          carousel_media: [
                            { media_type: 1 },
                            { media_type: 1 },
                          ],
                        }
                      : {}),
                  },
                },
              ],
              page_info: { has_next_page: true, end_cursor: "next-page" },
            },
          },
        });
      },
    );
    const result = await readPublicInstagramCreatorPage(
      { creatorKey: "instagram:123456789", handle: "creator" },
      null,
      traffic as typeof fetch,
      now,
    );
    expect(result.posts).toEqual([
      {
        postKey: "instagram:Photo00001",
        url: "https://www.instagram.com/p/Photo00001/",
        publishedAt: now - 3600000,
        durationMs: 0,
      },
    ]);
    expect(result.nextCursor).toBe("next-page");
    expect(result.profile.links).toEqual(["https://www.tiktok.com/@creator"]);
  },
);

it("keeps unauthenticated Instagram discovery off and rejects non-profile or foreign bio destinations", () => {
  vi.stubEnv("VIBESCROLL_CREATOR_DISCOVERY_ENABLED", "true");
  vi.stubEnv("VIBESCROLL_INSTAGRAM_PUBLIC_EMBED_ENABLED", "true");
  expect(publicCreatorFeedEnabled("instagram:123456789")).toBe(false);
  for (const url of [
    "http://www.instagram.com/creator/",
    "https://127.0.0.1/creator",
    "https://www.instagram.com@evil.test/creator",
    "https://www.tiktok.com/@creator/photo/12345",
    "https://www.instagram.com/accounts/",
    "https://x.com/intent",
  ])
    expect(publicProfileLink(url)).toBeNull();
});

it("stops before a feed request when Instagram cannot refresh session nonces", async () => {
  instagramSession();
  const transport = vi.fn(async () => new Response("<html>Sign in</html>"));
  await expect(
    readPublicInstagramCreatorPage(
      { creatorKey: "instagram:123456789", handle: "creator" },
      null,
      transport,
    ),
  ).rejects.toThrow("CREATOR_SESSION_UNAVAILABLE");
  expect(transport).toHaveBeenCalledOnce();
});

it("does not dispatch Instagram credentials after the bounded session expires", async () => {
  instagramSession();
  const s = JSON.parse(process.env.VIBESCROLL_INSTAGRAM_PROFILE_SESSION_JSON!);
  vi.stubEnv(
    "VIBESCROLL_INSTAGRAM_PROFILE_SESSION_JSON",
    JSON.stringify({ ...s, expiresAt: Date.now() - 1 }),
  );
  const transport = vi.fn();
  await expect(
    readPublicInstagramCreatorPage(
      { creatorKey: "instagram:123456789", handle: "creator" },
      null,
      transport,
    ),
  ).rejects.toThrow("CREATOR_SESSION_UNAVAILABLE");
  expect(transport).not.toHaveBeenCalled();
});
