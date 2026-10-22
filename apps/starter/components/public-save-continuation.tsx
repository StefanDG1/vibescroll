"use client";
import { useState } from "react";
export function PublicSaveContinuation({
  slug,
  version,
  organizationId,
  call,
  disabled,
}: {
  slug: string;
  version: number;
  organizationId: string;
  call: (operation: string, args: any) => Promise<any>;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (
    !/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug) ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return null;
  return (
    <section className="panel">
      <h2>Save this public edition</h2>
      <p>
        Review{" "}
        <a href={`/editions/${slug}`} target="_blank" rel="noopener noreferrer">
          {slug}, version {version}
        </a>
        . Saving keeps a reference to its current permitted base and your own
        private notes. It starts no analysis and uses no processing credits.
      </p>
      <button
        type="button"
        className="primary"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const result = await call("publicSaveEdition", {
              organizationId,
              slug,
              expectedVersion: version,
            });
            if (!result) throw Error("Save was not confirmed.");
            setMessage(
              "Saved to your Library. Open its source to add private notes.",
            );
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "This edition is unavailable or changed. Review it again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Save reviewed edition to my Library
      </button>
      <output>{message}</output>
    </section>
  );
}
