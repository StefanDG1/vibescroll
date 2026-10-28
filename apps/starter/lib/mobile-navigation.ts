export function mobileNavigationGroup(
  view: string,
): "home" | "library" | "projects" | "account" {
  if (view === "home") return "home";
  if (["library", "posts", "source", "shared"].includes(view)) return "library";
  if (
    ["projects", "proposals", "proposal", "improvements", "runs"].includes(view)
  )
    return "projects";
  return "account";
}
