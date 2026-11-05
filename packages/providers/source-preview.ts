import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { acquisitionPolicy } from "../media/acquisition";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2001::", 32, "ipv6");
export function publicPreviewAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export function previewUrl(raw: string, domains: readonly string[]) {
  const url = new URL(raw);
  if (
    raw.length > 4096 ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    !domains.some((d) =>
      d.startsWith("*.")
        ? url.hostname.endsWith(d.slice(1)) && url.hostname !== d.slice(2)
        : url.hostname === d,
    )
  )
    throw Error("Preview destination denied");
  return url;
}
async function boundedGet(
  raw: string,
  domains: readonly string[],
  maximum: number,
  kind: "html" | "jpeg",
  redirects = 0,
): Promise<Uint8Array> {
  const url = previewUrl(raw, domains);
  const signal = AbortSignal.timeout(12000);
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.length > 16 ||
    !addresses.every((a) => publicPreviewAddress(a.address)) ||
    signal.aborted
  )
    throw Error("Preview resolution denied");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        maxHeaderSize: 16384,
        headers: {
          "User-Agent": "VibeScroller/1.0 link-preview",
          Accept: kind === "html" ? "text/html" : "image/jpeg",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
          res.destroy();
          if (redirects >= 2 || !res.headers.location) {
            reject(Error("Preview redirect denied"));
            return;
          }
          boundedGet(
            new URL(res.headers.location, url).href,
            domains,
            maximum,
            kind,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (
          res.statusCode !== 200 ||
          !String(res.headers["content-type"] || "")
            .toLowerCase()
            .startsWith(kind === "html" ? "text/html" : "image/jpeg") ||
          Number(res.headers["content-length"] || 0) > maximum
        ) {
          res.destroy();
          reject(Error("Preview unavailable"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maximum) {
            res.destroy(Error("Preview limit"));
            return;
          }
          chunks.push(chunk);
          if (kind === "html") {
            const head = Buffer.concat(chunks, size);
            const end = head.indexOf("</head>");
            if (end >= 0) {
              resolve(head.subarray(0, end + 7));
              res.destroy();
            }
          }
        });
        res.on("error", reject);
        res.on("end", () => resolve(Buffer.concat(chunks, size)));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
export function postPreviewMetadata(html: string, sourceUrl: string) {
  if (Buffer.byteLength(html) > 500000) throw Error("Preview HTML limit");
  const fields = new Map<string, string>();
  function visit(node: DefaultTreeAdapterTypes.Node) {
    if ("tagName" in node && node.tagName === "meta") {
      const attrs = new Map(node.attrs.map((a) => [a.name, a.value]));
      const name = attrs.get("property") || attrs.get("name");
      if (
        name &&
        [
          "og:image",
          "og:url",
          "og:title",
          "article:published_time",
          "author",
          "video:duration",
        ].includes(name) &&
        !fields.has(name)
      )
        fields.set(name, attrs.get("content") || "");
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(parse(html));
  const canonical = fields.get("og:url");
  if (!canonical) return null;
  const source = acquisitionPolicy(sourceUrl);
  try {
    if (source.platform === "instagram") {
      const url = new URL(canonical);
      const post =
        /^\/(?:[A-Za-z0-9_.]{1,40}\/)?(?:p|reel|reels)\/([A-Za-z0-9_-]{5,30})\/?$/.exec(
          url.pathname,
        );
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
        post?.[1] !==
          new URL(source.url).pathname.split("/").filter(Boolean).pop()
      )
        return null;
    } else if (
      acquisitionPolicy(canonical).url.replace(/\/$/, "") !==
      source.url.replace(/\/$/, "")
    )
      return null;
  } catch {
    return null;
  }
  const image = fields.get("og:image");
  const author = fields.get("author")?.trim();
  const authorName =
    author && !/^https?:\/\//i.test(author) ? author.slice(0, 160) : undefined;
  const duration = Number(fields.get("video:duration"));
  const date = fields.get("article:published_time") || "";
  const timestamp = /^\d{4}-\d{2}-\d{2}T/.test(date) ? Date.parse(date) : NaN;
  const publishedAt =
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    timestamp <= Date.now() + 86400000
      ? timestamp
      : undefined;
  return {
    image,
    title: (fields.get("og:title") || "").slice(0, 160),
    ...(authorName ? { authorName } : {}),
    ...(Number.isFinite(duration) && duration > 0 && duration <= 600
      ? { durationSeconds: duration }
      : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}
export async function sourcePreview(sourceUrl: string) {
  const policy = acquisitionPolicy(sourceUrl);
  let image: string;
  let title = "";
  let publishedAt: number | undefined;
  let authorName: string | undefined;
  let durationSeconds: number | undefined;
  if (policy.platform === "youtube") {
    const u = new URL(policy.url),
      id =
        u.hostname === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v") || u.pathname.split("/").pop();
    image = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  } else {
    const bytes = await boundedGet(
      policy.url,
      [new URL(policy.url).hostname],
      500000,
      "html",
    );
    const metadata = postPreviewMetadata(
      new TextDecoder().decode(bytes),
      policy.url,
    );
    if (!metadata) return null;
    image = metadata.image ?? "";
    title = metadata.title;
    publishedAt = metadata.publishedAt;
    authorName = metadata.authorName;
    durationSeconds = metadata.durationSeconds;
    if (!image) return { title, authorName, durationSeconds, publishedAt };
  }
  const hosts = {
    instagram: ["*.cdninstagram.com", "*.fbcdn.net"],
    youtube: ["*.ytimg.com"],
    vimeo: ["*.vimeocdn.com"],
    tiktok: [
      "*.tiktokcdn.com",
      "*.tiktokcdn-us.com",
      "*.byteoversea.com",
      "*.ibytedtos.com",
    ],
  }[policy.platform];
  const metadata = { title, authorName, durationSeconds, publishedAt };
  // An unavailable cover must not discard already retrieved text metadata.
  let bytes: Uint8Array;
  try {
    bytes = await boundedGet(image, hosts, 1000000, "jpeg");
  } catch {
    return metadata;
  }
  if (
    bytes.length < 4 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes[2] !== 255
  )
    return metadata;
  return { ...metadata, bytes };
}
