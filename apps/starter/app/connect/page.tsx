import Link from "next/link";
import { PublicIntro, PublicPage } from "@/components/site";
import { McpConnectGuide } from "@/components/mcp-connect-guide";

export const metadata = {
  title: "Connect VibeScroll to your AI client",
  description:
    "Use your reviewed VibeScroll account from a supported ChatGPT or Codex connection.",
  alternates: { canonical: "https://scroll.companynerve.com/connect" },
};
export default function Connect() {
  return (
    <PublicPage layout="reader">
      <PublicIntro title="Connect your assistant">
        <p>
          Connect your existing VibeScroll account to a supported AI client.
          Browse current cited insights, save sources and review project
          relevance with the same workspace permissions.
        </p>
      </PublicIntro>
      <McpConnectGuide />
      <div className="public-support-links">
        <Link href="/app" prefetch={false}>
          Open your account
        </Link>
        <Link href="/connect/descriptor">Setup descriptor</Link>
        <Link href="/connect/agent">Plain-text instructions</Link>
      </div>
    </PublicPage>
  );
}
