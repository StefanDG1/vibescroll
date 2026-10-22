import { redirect } from "next/navigation";
import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../convex/_generated/dataModel";
import { publicContinuation } from "@/lib/public-knowledge-display";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    draft?: string;
    workspace?: string;
    view?: string;
    tier?: string;
    publicEdition?: string;
    publicVersion?: string;
  }>;
}) {
  const query = await searchParams;
  const continuation = publicContinuation(query);
  const id = await (
    await backend()
  ).mutation(
    api.organizations.ensureDefault,
    query.workspace
      ? { preferredId: query.workspace as Id<"organizations"> }
      : {},
  );
  if (!id) redirect(`/app/workspaces${continuation ? `?${continuation}` : ""}`);
  if (query.view === "billing")
    redirect(
      `/app/${id}/billing${query.tier === "pro" ? "?tier=pro" : "?tier=starter"}`,
    );
  redirect(`/app/${id}${continuation ? `?${continuation}` : ""}`);
}
