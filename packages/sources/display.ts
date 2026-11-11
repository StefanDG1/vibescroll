export const defaultLinkTitle = "Imported video link";

export function postDisplayTitle(source: {
  title?: string;
  url?: string;
  canonical?: string;
  linkPreview?: { title?: string };
}) {
  let generated = false;
  try {
    const url = new URL(source.url || source.canonical || "");
    const instagram = /^(?:www\.)?instagram\.com$/.test(url.hostname)
      ? url.pathname.match(/^\/reel\/([A-Za-z0-9_-]+)\/?$/)?.[1]
      : undefined;
    const tiktok = /^(?:www\.)?tiktok\.com$/.test(url.hostname)
      ? url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/)?.[1]
      : /^(?:vm|vt)\.tiktok\.com$/.test(url.hostname)
        ? url.pathname.match(/^\/([A-Za-z0-9]+)\/?$/)?.[1]
        : undefined;
    generated = Boolean(
      (instagram &&
        (source.title?.match(/^instagram reel ([A-Za-z0-9_-]+)$/i)?.[1] ===
          instagram ||
          /^(?:saved )?instagram(?: reel| video)?$/i.test(
            source.title?.trim() ?? "",
          ))) ||
      (tiktok &&
        (source.title?.match(/^tiktok video ([A-Za-z0-9_-]+)$/i)?.[1] ===
          tiktok ||
          /^(?:saved )?tiktok(?: video)?$/i.test(source.title?.trim() ?? ""))),
    );
  } catch {
    // A malformed locator must not turn a custom title into a placeholder.
  }
  const placeholder =
    !source.title?.trim() ||
    source.title === defaultLinkTitle ||
    source.title === "Saved video" ||
    generated;
  return (
    (placeholder ? source.linkPreview?.title || source.title : source.title) ||
    "Untitled post"
  );
}
