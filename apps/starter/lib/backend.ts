import "server-only";
import { localSnapshotRequest } from "./local-snapshot-request";
import { cache } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
export { api };
export const configured = () =>
  !!(
    process.env.NEXT_PUBLIC_CONVEX_URL &&
    process.env.WORKOS_CLIENT_ID &&
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_COOKIE_PASSWORD
  );
export const backend = cache(
  async (verifiedSession?: Awaited<ReturnType<typeof withAuth>>) => {
    if (
      process.env.VIBESCROLL_LOCAL_SNAPSHOT === "1" &&
      (await localSnapshotRequest())
    ) {
      const { localSnapshotClient } = await import("./local-snapshot");
      return (await localSnapshotClient()) as unknown as ConvexHttpClient;
    }
    const auth = verifiedSession ?? (await withAuth());
    // AuthKit starts PKCE in the proxy or sign-in route, where cookies are writable.
    // Rendering a Server Component must only read the session and redirect locally.
    if (!auth.user) redirect("/sign-in");
    if (!process.env.NEXT_PUBLIC_CONVEX_URL)
      throw new Error("Convex is not configured.");
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
    client.setAuth(auth.accessToken);
    if (await client.query(api.accounts.bootstrapRequired, {}))
      await client.action(api.identity.bootstrap, {});
    return client;
  },
);
