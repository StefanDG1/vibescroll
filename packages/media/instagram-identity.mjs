export function isInstagramSharePath(path) {
  return /^\/share\/(?:p|reel)\/[A-Za-z0-9_-]{5,30}\/?$/.test(path);
}

export function instagramPostShortcode(path) {
  if (isInstagramSharePath(path)) return null;
  return (
    /^(?:\/[A-Za-z0-9_.]{1,30})?\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{3,100})\/?$/.exec(
      path,
    )?.[1] ?? null
  );
}
