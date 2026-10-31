import Link from "next/link";
import { PublicPage } from "@/components/site";
import { McpConnectGuide } from "@/components/mcp-connect-guide";

export const metadata = {
  title: "Connect VibeScroll to your AI client",
  description:
    "Use your reviewed VibeScroll account from a supported ChatGPT or Codex connection.",
  alternates: { canonical: "https://scroll.companynerve.com/connect" },
};
export default function Connect() {
  return (
    <PublicPage>
      <section className="help-intro">
        <h1>Your saved knowledge, in your conversation.</h1>
        <p>
          Connect your existing VibeScroll account to a supported AI client.
          Browse current cited insights, save sources and review project
          relevance with the same workspace permissions.
        </p>
        <p>
          <Link href="/app" prefetch={false}>
            Open your VibeScroll account
          </Link>
        </p>
      </section>
      <McpConnectGuide />
      <p>
        For machine-readable connection information, see the{" "}
        <Link href="/connect/descriptor">setup descriptor</Link> and{" "}
        <Link href="/connect/agent">plain-text instructions</Link>.
      </p>
    </PublicPage>
  );
}
