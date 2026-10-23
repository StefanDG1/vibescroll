const instagramHosts = new Set(["instagram.com", "www.instagram.com"]);
const tiktokHosts = new Set(["tiktok.com", "www.tiktok.com"]);

function publicUrl(raw) {
  if (
    typeof raw !== "string" ||
    raw.length > 2048 ||
    /[\\\s]/u.test(raw) ||
    [...raw].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error("INVALID_SOCIAL_URL");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    /%[0-9a-f]{2}/i.test(url.pathname)
  )
    throw new Error("INVALID_SOCIAL_URL");
  return url;
}

/** URL identity is an intake key, not proof of ownership, access or stable creator ID. */
export function socialPostUrl(raw) {
  const url = publicUrl(raw);
  if (instagramHosts.has(url.hostname)) {
    const match = /^\/(?:p|reel|tv)\/([A-Za-z0-9_-]{3,100})\/?$/.exec(
      url.pathname,
    );
    if (!match) throw new Error("UNSUPPORTED_SOCIAL_POST");
    return {
      platform: "instagram",
      postKey: match[1],
      canonical: `https://www.instagram.com/p/${match[1]}/`,
    };
  }
  if (tiktokHosts.has(url.hostname)) {
    const match =
      /^\/@([a-zA-Z0-9_.]{1,24})\/(video|photo)\/(\d{5,30})\/?$/.exec(
        url.pathname,
      );
    if (!match) throw new Error("UNSUPPORTED_SOCIAL_POST");
    return {
      platform: "tiktok",
      postKey: match[3],
      canonical: `https://www.tiktok.com/@${match[1].toLowerCase()}/${match[2]}/${match[3]}`,
    };
  }
  throw new Error("UNSUPPORTED_SOCIAL_POST");
}

export function socialCreatorUrl(raw) {
  const url = publicUrl(raw);
  if (instagramHosts.has(url.hostname)) {
    const match = /^\/([a-zA-Z0-9_.]{1,30})\/?$/.exec(url.pathname);
    if (
      !match ||
      [
        "accounts",
        "explore",
        "direct",
        "reels",
        "stories",
        "p",
        "reel",
        "tv",
      ].includes(match[1].toLowerCase())
    )
      throw new Error("UNSUPPORTED_CREATOR");
    return {
      platform: "instagram",
      handle: match[1].toLowerCase(),
      canonical: `https://www.instagram.com/${match[1].toLowerCase()}/`,
    };
  }
  if (tiktokHosts.has(url.hostname)) {
    const match = /^\/@([a-zA-Z0-9_.]{1,24})\/?$/.exec(url.pathname);
    if (!match) throw new Error("UNSUPPORTED_CREATOR");
    return {
      platform: "tiktok",
      handle: match[1].toLowerCase(),
      canonical: `https://www.tiktok.com/@${match[1].toLowerCase()}`,
    };
  }
  throw new Error("UNSUPPORTED_CREATOR");
}

// Candidate-era captures used each Instagram route/host literally. Lookup only
// these bounded same-post aliases; never scan or merge other private content.
export function socialPostAliases(raw) {
  const identity = socialPostUrl(raw);
  if (identity.platform === "instagram")
    return ["instagram.com", "www.instagram.com"].flatMap((host) =>
      ["p", "reel", "tv"].flatMap((route) =>
        ["", "/"].map(
          (slash) => `https://${host}/${route}/${identity.postKey}${slash}`,
        ),
      ),
    );
  return [identity.canonical, identity.canonical + "/"];
}
