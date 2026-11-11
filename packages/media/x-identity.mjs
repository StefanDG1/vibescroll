/** Canonical post identity, independent of mutable handles or media selection. */
export function xPostUrl(raw) {
  if (
    typeof raw !== "string" ||
    raw.length > 2048 ||
    // oxlint-disable-next-line no-control-regex -- Reject untrusted controls before URL normalization.
    /[\\\s\u0000-\u001f\u007f]/u.test(raw) ||
    /%(?:2e|2f|5c|00)/i.test(raw)
  )
    throw Error("INVALID_X_POST_URL");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    ![
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
    ].includes(url.hostname) ||
    /\/(?:\.|\.\.)(?:\/|[?#]|$)/.test(raw)
  )
    throw Error("INVALID_X_POST_URL");
  const match =
    /^\/(?:(?:[A-Za-z0-9_]{1,15}|i\/web|i)\/status|statuses)\/([0-9]{2,20})(?:\/(?:photo|video)\/[1-9][0-9]?)?\/?$/.exec(
      url.pathname,
    );
  if (!match) throw Error("INVALID_X_POST_URL");
  return {
    postId: match[1],
    canonical: `https://x.com/i/web/status/${match[1]}`,
  };
}
