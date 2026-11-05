// Adapted from assistant-ui Elements at 3fa379f814dadb02b9f9ad04e31c2d2ba92df094.
// Copyright (c) 2026 AgentbaseAI Inc. MIT; see licenses/assistant-ui-elements-3fa379f.txt.
import type { ReactNode } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import styles from "./analysis-elements.module.css";

export function ErrorState({
  title,
  detail,
  action,
  tone = "error",
  retrying = false,
  onRetry,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  tone?: "error" | "attention";
  retrying?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div
      className={styles.error}
      data-slot="error-state"
      data-tone={tone}
      role={retrying || tone === "attention" ? "status" : "alert"}
    >
      {retrying ? (
        <RefreshCw size={18} className="spinner" aria-hidden="true" />
      ) : (
        <CircleAlert size={18} aria-hidden="true" />
      )}
      <div className={styles.errorCopy}>
        <p className={styles.errorTitle}>{retrying ? "Retrying" : title}</p>
        {!retrying && <p>{detail}</p>}
        {!retrying && action}
      </div>
      {!retrying && onRetry && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
