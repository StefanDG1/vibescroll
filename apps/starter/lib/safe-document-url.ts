export function safeHelpUrl(value: string) {
  if (/^#[a-zA-Z0-9_-]*$/.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value))
    return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
    if (
      url.protocol === "mailto:" &&
      !url.search &&
      !url.hash &&
      /^[^?\s]+@[^?\s]+$/.test(url.pathname)
    )
      return value;
  } catch {
    // Invalid and relative external URLs are not navigation targets.
  }
  return "";
}
