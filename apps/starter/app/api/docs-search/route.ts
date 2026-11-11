import { createSearchAPI } from "fumadocs-core/search/server";
import { developerSearchIndexes } from "@/lib/developer-docs";

const indexes = developerSearchIndexes();
const search = createSearchAPI("simple", { indexes: () => indexes });
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query") ?? "";
  if (query.length > 200) return Response.json([], { status: 400 });
  // Public, authored docs only. No account, Convex or provider access.
  return search.GET(request);
}
