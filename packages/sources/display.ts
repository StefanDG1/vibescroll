export function postDisplayTitle(source: {
  title?: string;
  linkPreview?: { title?: string };
}) {
  return (
    (source.title === "Imported video link"
      ? source.linkPreview?.title || source.title
      : source.title) || "Untitled post"
  );
}
