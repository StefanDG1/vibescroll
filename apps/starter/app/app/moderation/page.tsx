import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { PublicModeration } from "@/components/public-moderation";

export default async function Page() {
  const auth = await withAuth();
  if (!auth.user) redirect("/sign-in?returnTo=%2Fapp%2Fmoderation");
  return (
    <div className="container">
      <Header />
      <main id="main" className="doc">
        <h1>Public library moderation</h1>
        <p>
          Only operator-authorized moderators can read reports. A decision
          requires a recent sign-in.
        </p>
        <PublicModeration />
      </main>
    </div>
  );
}
