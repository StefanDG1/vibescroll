"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Terminal,
} from "lucide-react";
import { setupDescriptor } from "../../../packages/widget/setup";
import {
  chooseOnboardingAssistant,
  checkOnboardingAssistant,
} from "@/app/onboarding/actions";
import { OnboardingGraphic } from "./onboarding-graphic";
import styles from "./onboarding.module.css";

export function OnboardingAssistant({
  initialReady,
  paid,
  compact = false,
}: {
  initialReady: {
    ready: boolean;
    client: string | null;
    oauthClient?: { id: string; name: string } | null;
  };
  paid: boolean;
  compact?: boolean;
}) {
  const [screen, setScreen] = useState<
    "choose" | "chatgpt" | "codex" | "credits"
  >("choose");
  const [observed, setObserved] = useState(initialReady);
  const [setupStep, setSetupStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState("");
  const [checking, startChecking] = useTransition();
  const ready = observed.ready;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setMessage("Select and copy the text above.");
    }
  }
  const next = (choice: "later" | "check" | "connected", label: string) => (
    <form action={chooseOnboardingAssistant}>
      <input type="hidden" name="choice" value={choice} />
      <button className={styles.primary}>
        {label} <ArrowRight size={16} />
      </button>
    </form>
  );
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, setupStep]);
  if (compact)
    return (
      <div className={styles.notice}>
        <strong>
          {ready
            ? `${observed.client ?? "Assistant"} connection verified`
            : "Your assistant can check access now"}
        </strong>
        <p>
          {ready
            ? "Your supported assistant tools are ready. Background analysis has its own setup."
            : "In your connected assistant, ask it to list your VibeScroll workspaces. No analysis or credits are needed."}
        </p>
        <button
          type="button"
          className={styles.secondary}
          disabled={checking}
          onClick={() =>
            startChecking(async () => {
              try {
                const status = await checkOnboardingAssistant();
                setObserved(status);
                setMessage(
                  status.ready
                    ? "Connection verified."
                    : "No completed check yet. You can open Home and finish this later.",
                );
              } catch {
                setMessage(
                  "The check could not complete. Open Home and retry from Connections.",
                );
              }
            })
          }
        >
          {checking ? "Checking…" : "Check connection"}
        </button>
        <output aria-live="polite">{message}</output>
      </div>
    );
  return (
    <section
      className={styles.stage}
      data-onboarding-stage={`assistant-${screen}`}
    >
      {screen !== "choose" && (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            if ((screen === "chatgpt" || screen === "codex") && setupStep > 0)
              setSetupStep((value) => value - 1);
            else {
              setScreen("choose");
              setSetupStep(0);
            }
            setMessage("");
          }}
        >
          <ArrowLeft size={17} /> Back
        </button>
      )}
      <h1 ref={heading} tabIndex={-1}>
        {screen === "credits"
          ? "You can start with VibeScroll credits."
          : screen === "choose"
            ? "Use your ideas in the chat you already work in."
            : setupStep === 0
              ? "Open your assistant."
              : setupStep === 1
                ? "Add VibeScroll to your assistant."
                : paid
                  ? "Check your connection."
                  : "Finish the check after Pro."}
      </h1>
      {screen === "credits" ? (
        <>
          <OnboardingGraphic kind="credits" />
          <p className={styles.subtle}>
            Analyze posts and create plans inside VibeScroll using your included
            credits. Connect an assistant later to search, discuss ideas and
            draft plans in your own chat using its allowance.
          </p>
          <p className={styles.footnote}>
            Video preparation and work run inside VibeScroll may still use
            credits. You see a quote before new work starts.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setScreen("choose")}
            >
              Connect my assistant
            </button>
            {next("later", "Continue with credits")}
          </div>
        </>
      ) : screen === "choose" ? (
        <>
          <p className={styles.subtle}>
            Search your insights, discuss them and save project plans from your
            assistant. MCP is the connection that makes this possible.
          </p>
          <OnboardingGraphic kind="assistant" />
          {ready ? (
            <>
              <p className={styles.status}>
                <Check size={19} /> {observed.client} connection verified
              </p>
              {next("connected", "Continue")}
            </>
          ) : (
            <>
              <div className={styles.importPaths}>
                <button
                  type="button"
                  onClick={() => {
                    setSetupStep(0);
                    setScreen("chatgpt");
                  }}
                >
                  <MessageCircle size={24} />
                  <span>
                    <strong>Connect ChatGPT</strong>
                    <small>Recommended for working in your chats</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetupStep(0);
                    setScreen("codex");
                  }}
                >
                  <Terminal size={24} />
                  <span>
                    <strong>Connect Codex</strong>
                    <small>Bring insights into your coding workflow</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              </div>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setScreen("credits")}
              >
                Connect later
              </button>
            </>
          )}
        </>
      ) : (
        <>
          {setupStep === 0 && (
            <>
              <OnboardingGraphic kind="assistant" />
              <p className={styles.subtle}>
                {screen === "chatgpt"
                  ? "In ChatGPT, use VibeScroll if it is already in your Plugins. Otherwise, add a custom MCP server if your account or workspace supports it."
                  : "Add VibeScroll using your Codex client's supported plugin or HTTP MCP settings. Keep an existing connection if you already have one."}
              </p>
              <a
                className={styles.secondary}
                href={
                  screen === "chatgpt" ? "https://chatgpt.com/" : "/connect"
                }
                target="_blank"
                rel="noreferrer"
              >
                {screen === "chatgpt"
                  ? "Open ChatGPT"
                  : "Open connection guide"}{" "}
                <ExternalLink size={15} />
              </a>
            </>
          )}
          {setupStep === 1 && (
            <>
              <p className={styles.subtle}>
                Use this server URL and choose OAuth authentication. Complete
                the official sign-in when your assistant asks.
              </p>
              <div className={styles.copyBox}>
                <code>{setupDescriptor.server.url}</code>
                <button
                  type="button"
                  aria-label="Copy MCP server URL"
                  onClick={() => void copy(setupDescriptor.server.url)}
                >
                  <Copy size={17} />
                </button>
              </div>
              {observed.oauthClient && (
                <>
                  <p className={styles.footnote}>
                    If asked for an OAuth client ID, use this public identifier.
                  </p>
                  <div className={styles.copyBox}>
                    <code>{observed.oauthClient.id}</code>
                    <button
                      type="button"
                      aria-label="Copy public OAuth client ID"
                      onClick={() => void copy(observed.oauthClient!.id)}
                    >
                      <Copy size={17} />
                    </button>
                  </div>
                </>
              )}
              {screen === "codex" && (
                <div className={styles.copyBox}>
                  <code>
                    codex mcp add vibescroll --url {setupDescriptor.server.url}
                    <br />
                    codex mcp login vibescroll
                  </code>
                  <button
                    type="button"
                    aria-label="Copy Codex setup commands"
                    onClick={() =>
                      void copy(
                        `codex mcp add vibescroll --url ${setupDescriptor.server.url}\ncodex mcp login vibescroll`,
                      )
                    }
                  >
                    <Copy size={17} />
                  </button>
                </div>
              )}
            </>
          )}
          {setupStep === 2 && (
            <>
              <p className={styles.subtle}>
                {paid
                  ? "In your assistant, ask it to list your VibeScroll workspaces. Then check here."
                  : "Your assistant can verify access once Pro is active. You can continue now and finish that check after payment."}
              </p>
              <p className={styles.footnote}>
                The check reads your workspace list. It starts no analysis and
                uses no VibeScroll credits. Background analysis is a separate
                setup.
              </p>
              <button
                type="button"
                className={styles.secondary}
                disabled={checking}
                onClick={() =>
                  startChecking(async () => {
                    try {
                      const value = await checkOnboardingAssistant();
                      setObserved(value);
                      setMessage(
                        value.ready
                          ? "Connection verified."
                          : paid
                            ? "No completed assistant check yet. Follow the last step, or continue and check later."
                            : "A read-only assistant check becomes available after Pro. You can continue with setup saved.",
                      );
                    } catch {
                      setMessage(
                        "Connection status could not be checked. You can continue and retry later.",
                      );
                    }
                  })
                }
              >
                {checking ? "Checking…" : "Check connection"}
              </button>
              <output className={styles.footnote} aria-live="polite">
                {message}
              </output>
            </>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setScreen("credits")}
            >
              Connect later
            </button>
            {setupStep < 2 ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  setSetupStep((value) => value + 1);
                  setMessage("");
                }}
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              next(
                ready ? "connected" : "check",
                ready ? "Continue" : "Continue setup",
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}
