/** Next route segments can retain URI encoding. Decode once at the web boundary. */
export function creatorRouteKey(value: string): string | null {
  if (value.length > 320) return null;
  let key: string;
  try {
    key = decodeURIComponent(value);
  } catch {
    return null;
  }
  return /^(instagram|tiktok|x):[A-Za-z0-9_-]{1,100}$/.test(key) ? key : null;
}
