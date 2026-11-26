import { expect, it, vi } from "vitest";
import { readPublicPostAuthor } from "../packages/social/post-author";
import { validPostAuthorProof } from "../packages/social/post-author-proof";

const canonical = "https://www.instagram.com/p/Abcdef12345/";
const embed = (owner = "12345", name = "creator") =>
  `<div class="Embed" data-owner-id="${owner}" data-media-id="1234567" data-media-type="GraphVideo" data-permalink="${canonical}"><a class="Username" href="https://www.instagram.com/${name}/?utm_source=ig_embed">Creator</a><a class="CaptionUsername" href="https://www.instagram.com/${name}/">Creator</a><a class="EmbeddedMedia" href="${canonical}"></a></div>`;

it("recovers a stable owner from the original embed without fetching media, scripts or profile links", async () => {
  const transport = vi.fn(async () => new Response(embed()));
  const proof = await readPublicPostAuthor(canonical, transport, 1000);
  expect(proof).toMatchObject({
    creatorKey: "instagram:12345",
    handle: "creator",
    postKey: "instagram:Abcdef12345",
    observedAt: 1000,
  });
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    `${canonical}embed/captioned/`,
    expect.objectContaining({ redirect: "error" }),
  );
  expect(
    validPostAuthorProof(proof, canonical.replace("Abcdef12345", "Other12345")),
  ).toBeNull();
  expect(
    validPostAuthorProof({ ...proof, creatorKey: "tiktok:12345" }, canonical),
  ).toBeNull();
});

it.each([
  embed().replace('data-owner-id="12345"', 'data-owner-id="display-name"'),
  embed().replace(
    'data-permalink="' + canonical + '"',
    'data-permalink="https://www.instagram.com/p/Other12345/"',
  ),
  embed() + embed(),
  embed().replace("creator/?utm_source", "impostor/?utm_source"),
  embed().replace(
    "https://www.instagram.com/creator/?utm_source",
    "https://evil.example/creator/?utm_source",
  ),
  embed().replace("GraphVideo", "PrivateVideo"),
])(
  "rejects ambiguous, private or mismatched Instagram identity",
  async (html) => {
    await expect(
      readPublicPostAuthor(canonical, async () => new Response(html)),
    ).rejects.toThrow(/POST_AUTHOR/);
  },
);

it("resolves a legacy numeric TikTok handle by the exact post ID and public structured author", async () => {
  const item = {
    id: "7553302113757990166",
    author: { id: "7015458621131801605", uniqueId: "hullcity" },
  };
  const html = (data: unknown) =>
    `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode: 0, itemInfo: { itemStruct: data } } } })}</script>`;
  const url =
    "https://www.tiktok.com/@7015458621131801605/video/7553302113757990166";
  expect(
    await readPublicPostAuthor(url, async () => new Response(html(item))),
  ).toMatchObject({
    creatorKey: "tiktok:7015458621131801605",
    handle: "hullcity",
  });
  await expect(
    readPublicPostAuthor(
      url,
      async () => new Response(html({ ...item, privateItem: true })),
    ),
  ).rejects.toThrow("POST_AUTHOR_UNAVAILABLE");
  await expect(
    readPublicPostAuthor(
      url,
      async () => new Response(html({ ...item, id: "7553302113757990167" })),
    ),
  ).rejects.toThrow("POST_AUTHOR_UNAVAILABLE");
});

it("binds X metadata to the exact status and refuses unavailable or oversized responses", async () => {
  const url = "https://x.com/creator/status/1840000000000000000",
    transport = vi.fn(async () =>
      Response.json({
        code: 200,
        tweet: {
          id: "1840000000000000000",
          author: { id: "1234", screen_name: "creator" },
        },
      }),
    );
  expect(await readPublicPostAuthor(url, transport)).toMatchObject({
    creatorKey: "x:1234",
    handle: "creator",
  });
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    "https://api.fxtwitter.com/status/1840000000000000000",
    expect.objectContaining({ redirect: "error" }),
  );
  await expect(
    readPublicPostAuthor(
      canonical,
      async () => new Response("unavailable", { status: 404 }),
    ),
  ).rejects.toThrow("POST_AUTHOR_UNAVAILABLE");
  await expect(
    readPublicPostAuthor(
      canonical,
      async () => new Response("a".repeat(2_000_001)),
    ),
  ).rejects.toThrow("POST_AUTHOR_LIMIT");
});

it("follows only bounded TikTok short-link redirects and binds the resolved author to the input", async () => {
  const short = "https://vm.tiktok.com/ZMabc1234/",
    full = "https://www.tiktok.com/@hullcity/video/7553302113757990166";
  const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode: 0, itemInfo: { itemStruct: { id: "7553302113757990166", author: { id: "7015458621131801605", uniqueId: "hullcity" } } } } } })}</script>`;
  const transport = vi.fn(async (url: string | URL | Request) =>
    String(url) === short
      ? new Response(null, { status: 302, headers: { location: full } })
      : new Response(html),
  );
  const proof = await readPublicPostAuthor(short, transport);
  expect(proof).toMatchObject({
    inputCanonical: short,
    resolvedCanonical: full,
    postKey: "tiktok:7553302113757990166",
  });
  expect(validPostAuthorProof(proof, short)).not.toBeNull();
  expect(
    validPostAuthorProof(proof, "https://vm.tiktok.com/ZMxxxxxx/"),
  ).toBeNull();
  expect(transport).toHaveBeenCalledTimes(2);
  const foreign = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/private" },
      }),
  );
  await expect(readPublicPostAuthor(short, foreign)).rejects.toThrow(
    "POST_AUTHOR_IDENTITY_CHANGED",
  );
  expect(foreign).toHaveBeenCalledTimes(1);
  await expect(
    readPublicPostAuthor(
      short,
      async () =>
        new Response(null, { status: 302, headers: { location: short } }),
    ),
  ).rejects.toThrow("POST_AUTHOR_IDENTITY_CHANGED");
});
