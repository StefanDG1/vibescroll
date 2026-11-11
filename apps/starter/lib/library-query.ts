import "server-only";
import { api, backend } from "./backend";
import type { Id } from "../../../convex/_generated/dataModel";

export function loadLibraryPage(
  client: Awaited<ReturnType<typeof backend>>,
  options: {
    organizationId: Id<"organizations">;
    query?: string;
    state?: string;
    category?: string;
    sort?: string;
    cursor?: string;
  },
) {
  const { query, sort, ...args } = options;
  return query?.trim()
    ? client.action(api.workspaceSearchActions.library, {
        ...args,
        query: query.trim(),
      })
    : client.query(api.product.library, { ...args, sort });
}
