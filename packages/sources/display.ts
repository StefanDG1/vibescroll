export const defaultLinkTitle = "Imported video link";

export function postDisplayTitle(source: {
  title?: string;
  linkPreview?: { title?: string };
}) {
  return (
    (source.title === defaultLinkTitle || source.title === "Saved video"
      ? source.linkPreview?.title || source.title
      : source.title) || "Untitled post"
  );
}
