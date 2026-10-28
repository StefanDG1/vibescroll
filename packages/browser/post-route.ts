export function postPagePath(organizationId: string, sourceId: string) {
  if (
    ![organizationId, sourceId].every((id) => /^[a-zA-Z0-9_-]{1,100}$/.test(id))
  )
    throw Error("Post unavailable.");
  return `/app/${encodeURIComponent(organizationId)}/posts/${encodeURIComponent(sourceId)}`;
}
