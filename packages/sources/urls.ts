import { safePath, excludedPath } from "../policy";

function sourceUrl(raw: string, hosts: readonly string[]) {
  // Check before URL normalization erases dot segments or encoded separators.
  if (
    raw.length > 2048 ||
    // oxlint-disable-next-line no-control-regex -- Reject untrusted URL controls before normalization.
    /[\\\u0000-\u0020\u007f]/.test(raw) ||
    /%(?:2f|5c|2e|00)/i.test(raw) ||
    /\/(?:\.|\.\.)(?:\/|[?#]|$)/.test(raw)
  )
    throw Error("INVALID_SOURCE_URL");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    !hosts.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error("INVALID_SOURCE_URL");
  return url;
}
export function githubSourceUrl(raw: string) {
  const url = sourceUrl(raw, ["github.com"]);
  const match =
    /^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(
      url.pathname,
    );
  if (!match || [".", ".."].includes(match[2]))
    throw Error("INVALID_GITHUB_SOURCE");
  const repository = `${match[1]}/${match[2]}`;
  return { url: `https://github.com/${repository}`, repository };
}
export function redditSourceUrl(raw: string) {
  const url = sourceUrl(raw, [
    "reddit.com",
    "www.reddit.com",
    "old.reddit.com",
  ]);
  const match =
    /^\/r\/([A-Za-z0-9_]{2,30})\/comments\/([a-z0-9]{3,10})(?:\/([A-Za-z0-9_-]{0,200}))?\/?$/.exec(
      url.pathname,
    );
  if (!match) throw Error("CANONICAL_REDDIT_PERMALINK_REQUIRED");
  return {
    url: `https://www.reddit.com/r/${match[1]}/comments/${match[2]}/`,
    subreddit: match[1],
    postId: match[2],
  };
}
export function safeSourcePath(path: string) {
  return (
    safePath(path) &&
    !excludedPath(path) &&
    !/[\u007f?#%]/.test(path) &&
    !/(^|\/)(?:\.npmrc|\.pypirc|id_rsa|id_ed25519|.*\.(?:p12|pfx|keystore))$/i.test(
      path,
    )
  );
}
export function githubBlobUrl(
  repository: string,
  commit: string,
  path: string,
) {
  const parsed = githubSourceUrl(`https://github.com/${repository}`);
  if (!/^[a-f0-9]{40}$/.test(commit) || !safeSourcePath(path))
    throw Error("INVALID_GITHUB_EVIDENCE");
  return `${parsed.url}/blob/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
export function suppliedSourceUrl(raw: string | null) {
  if (raw === null) return null;
  try {
    return githubSourceUrl(raw).url;
  } catch {
    return redditSourceUrl(raw).url;
  }
}
