import { parse } from "parse5";
import { platformPostKey } from "../sources/post-identity";
import { publicProfileLink } from "./creator-identity";
import { readAuthenticatedInstagramPostAuthor } from "./public-creators";
import {
  validPostAuthorProof,
  tikTokShortUrl,
  type PostAuthorProof,
} from "./post-author-proof";

async function body(response: Response) {
  if (!response.ok || !response.body) throw Error("POST_AUTHOR_UNAVAILABLE");
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "",
    bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 2_000_000) throw Error("POST_AUTHOR_LIMIT");
      text += decoder.decode(next.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

/** Reads identity only. Never follows page links, downloads media or executes scripts. */
export async function readPublicPostAuthor(
  canonical: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
): Promise<PostAuthorProof> {
  let resolvedCanonical = canonical;
  const short = tikTokShortUrl(canonical);
  if (short) {
    let current = short,
      resolved = false;
    for (let i = 0; i < 4; i++) {
      const response = await transport(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(9000),
      });
      await response.body?.cancel().catch(() => {});
      if (![301, 302, 303, 307, 308].includes(response.status))
        throw Error("POST_AUTHOR_UNAVAILABLE");
      const location = response.headers.get("location");
      if (!location) throw Error("POST_AUTHOR_UNAVAILABLE");
      const next = new URL(location, current).href,
        key = platformPostKey(next);
      if (key?.startsWith("tiktok:")) {
        resolvedCanonical = next;
        resolved = true;
        break;
      }
      const nested = tikTokShortUrl(next);
      if (!nested || nested === current)
        throw Error("POST_AUTHOR_IDENTITY_CHANGED");
      current = nested;
    }
    if (!resolved) throw Error("POST_AUTHOR_UNAVAILABLE");
  }
  const postKey = platformPostKey(resolvedCanonical);
  if (!postKey) throw Error("POST_AUTHOR_IDENTITY_CHANGED");
  const [platform, id] = postKey.split(":"),
    fetchText = async (url: string) =>
      body(
        await transport(url, {
          redirect: "error",
          signal: AbortSignal.timeout(9000),
        }),
      );
  let creatorKey: string, handle: string, method: PostAuthorProof["method"];
  if (platform === "instagram") {
    try {
      const html = await fetchText(
          `https://www.instagram.com/p/${id}/embed/captioned/`,
        ),
        pending: any[] = [parse(html)],
        roots: any[] = [];
      let visited = 0;
      while (pending.length && ++visited <= 30000) {
        const node = pending.pop(),
          attrs = Object.fromEntries(
            (node.attrs ?? []).map((a: any) => [a.name, a.value]),
          );
        if (
          node.nodeName === "div" &&
          attrs.class?.split(/\s+/).includes("Embed")
        )
          roots.push(node);
        pending.push(...(node.childNodes ?? []));
      }
      if (pending.length) throw Error("POST_AUTHOR_LIMIT");
      if (roots.length > 1) throw Error("POST_AUTHOR_IDENTITY_CHANGED");
      if (roots.length === 0) throw Error("POST_AUTHOR_UNAVAILABLE");
      const root = roots[0],
        attrs = Object.fromEntries(
          root.attrs.map((a: any) => [a.name, a.value]),
        ),
        names = new Set<string>(),
        captions = new Set<string>(),
        media = new Set<string>();
      if (
        !/^[0-9]{1,30}$/.test(attrs["data-owner-id"] ?? "") ||
        !/^[0-9]{1,30}$/.test(attrs["data-media-id"] ?? "") ||
        !["GraphVideo", "GraphImage", "GraphSidecar"].includes(
          attrs["data-media-type"],
        ) ||
        platformPostKey(attrs["data-permalink"] ?? "") !== postKey
      )
        throw Error("POST_AUTHOR_IDENTITY_CHANGED");
      pending.push(root);
      while (pending.length) {
        const node = pending.pop(),
          a = Object.fromEntries(
            (node.attrs ?? []).map((x: any) => [x.name, x.value]),
          ),
          classes = a.class?.split(/\s+/) ?? [];
        if (node.nodeName === "a") {
          if (classes.includes("EmbeddedMedia"))
            media.add(platformPostKey(a.href ?? "") ?? "invalid");
          if (
            classes.includes("Username") ||
            classes.includes("CaptionUsername")
          ) {
            const profile = publicProfileLink(a.href ?? "");
            if (!profile?.startsWith("https://www.instagram.com/"))
              throw Error("POST_AUTHOR_IDENTITY_CHANGED");
            (classes.includes("CaptionUsername") ? captions : names).add(
              profile.split("/")[3],
            );
          }
        }
        pending.push(...(node.childNodes ?? []));
      }
      if (
        names.size !== 1 ||
        (captions.size &&
          (captions.size !== 1 || !captions.has([...names][0]))) ||
        media.size !== 1 ||
        !media.has(postKey)
      )
        throw Error("POST_AUTHOR_IDENTITY_CHANGED");
      creatorKey = `instagram:${attrs["data-owner-id"]}`;
      handle = [...names][0];
      method = "instagram_embed";
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "POST_AUTHOR_UNAVAILABLE"
      )
        throw error;
      const author = await readAuthenticatedInstagramPostAuthor(id, transport);
      creatorKey = `instagram:${author.authorId}`;
      handle = author.authorHandle;
      method = "instagram_media_api";
    }
  } else if (platform === "tiktok") {
    const input = new URL(resolvedCanonical),
      match =
        /^\/@([A-Za-z0-9_.]{1,30})\/(?:video|photo)\/[0-9]{10,25}\/?$/.exec(
          input.pathname,
        );
    if (!match) throw Error("POST_AUTHOR_IDENTITY_CHANGED");
    const html = await fetchText(
        `https://www.tiktok.com/@${match[1]}/video/${id}`,
      ),
      pending: any[] = [parse(html)],
      scripts: string[] = [];
    let visited = 0;
    while (pending.length && ++visited <= 30000) {
      const node = pending.pop();
      if (
        node.nodeName === "script" &&
        node.attrs?.some(
          (a: any) =>
            a.name === "id" && a.value === "__UNIVERSAL_DATA_FOR_REHYDRATION__",
        )
      )
        scripts.push(
          node.childNodes?.map((n: any) => n.value ?? "").join("") ?? "",
        );
      pending.push(...(node.childNodes ?? []));
    }
    if (pending.length || scripts.length !== 1)
      throw Error("POST_AUTHOR_UNAVAILABLE");
    const detail = JSON.parse(scripts[0])?.__DEFAULT_SCOPE__?.[
        "webapp.video-detail"
      ],
      item = detail?.itemInfo?.itemStruct;
    if (
      detail?.statusCode !== 0 ||
      item?.id !== id ||
      item.privateItem ||
      item.secret ||
      item.author?.privateAccount
    )
      throw Error("POST_AUTHOR_UNAVAILABLE");
    creatorKey = `tiktok:${item.author?.id}`;
    handle = item.author?.uniqueId;
    method = "tiktok_page";
  } else if (platform === "x") {
    const row = JSON.parse(
      await body(
        await transport(`https://api.fxtwitter.com/2/status/${id}`, {
          headers: {
            "User-Agent": "VibeScroll/1.0 (+https://scroll.companynerve.com)",
          },
          redirect: "error",
          signal: AbortSignal.timeout(9000),
        }),
      ),
    );
    if (
      row.code !== 200 ||
      row.status?.id !== id ||
      row.status?.author?.protected !== false
    )
      throw Error("POST_AUTHOR_UNAVAILABLE");
    creatorKey = `x:${row.status?.author?.id}`;
    handle = row.status?.author?.screen_name;
    method = "x_public_api";
  } else throw Error("POST_AUTHOR_UNAVAILABLE");
  const proof = validPostAuthorProof(
    {
      version: "public-post-author-v1",
      postKey,
      creatorKey,
      handle,
      observedAt: now,
      method,
      ...(short ? { inputCanonical: canonical, resolvedCanonical } : {}),
    },
    canonical,
  );
  if (!proof) throw Error("POST_AUTHOR_IDENTITY_CHANGED");
  return proof;
}
