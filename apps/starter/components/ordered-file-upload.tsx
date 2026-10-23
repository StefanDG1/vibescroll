"use client";

import { useEffect, useRef, useState } from "react";

const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
];
type FileRow = {
  id: number;
  file: File;
  state:
    "waiting" | "hashing" | "uploading" | "verifying" | "uploaded" | "failed";
  key?: string;
  sha256?: string;
};
export function validateOrderedFiles(
  files: readonly Pick<File, "size" | "type">[],
) {
  if (!files.length || files.length > 35)
    throw new Error("Choose between 1 and 35 images or videos.");
  if (
    files.some(
      (file) =>
        !Number.isSafeInteger(file.size) ||
        file.size <= 0 ||
        !allowedTypes.includes(file.type),
    )
  )
    throw new Error("Choose non-empty JPEG, PNG, WebP, MP4 or WebM files.");
  if (files.reduce((sum, file) => sum + file.size, 0) > 250_000_000)
    throw new Error("The files together must be no larger than 250 MB.");
}

export function OrderedFileUpload({
  organizationId,
  call,
  onDone,
  demo = false,
}: {
  organizationId: string;
  call: (operation: string, args: Record<string, unknown>) => Promise<unknown>;
  onDone: (sourceId: string) => void;
  demo?: boolean;
}) {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const patch = (rowId: number, change: Partial<FileRow>) =>
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...change } : row)),
    );
  const move = (index: number, offset: number) =>
    setRows((current) => {
      const updated = [...current];
      [updated[index], updated[index + offset]] = [
        updated[index + offset],
        updated[index],
      ];
      return updated;
    });
  return (
    <form
      className="form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        if (demo || inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError("");
        const data = new FormData(event.currentTarget);
        const abort = new AbortController();
        controller.current = abort;
        try {
          validateOrderedFiles(rows.map((row) => row.file));
          if (data.get("rights") !== "on")
            throw new Error("Confirm that you may submit these files.");
          const originalUrl = String(data.get("originalUrl") || "").trim();
          if (originalUrl) {
            const parsed = new URL(originalUrl);
            if (
              parsed.protocol !== "https:" ||
              parsed.username ||
              parsed.password ||
              parsed.port ||
              parsed.hash ||
              originalUrl.length > 2048
            )
              throw new Error(
                "Use an HTTPS original link without sign-in details, a port or a fragment.",
              );
          }
          const pending = rows.filter((row) => row.state !== "uploaded");
          let grants: { key: string; url: string }[] = [];
          if (pending.length) {
            const response = await fetch("/api/uploads/batch-grant", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: abort.signal,
              body: JSON.stringify({
                organizationId,
                files: pending.map((row) => ({
                  size: row.file.size,
                  type: row.file.type,
                })),
              }),
            });
            const result = await response.json();
            if (
              !response.ok ||
              !Array.isArray(result.uploads) ||
              result.uploads.length !== pending.length
            )
              throw new Error(
                result.error || "Private upload permission failed. Try again.",
              );
            grants = result.uploads;
          }
          const uploaded = new Map<number, { key: string; sha256: string }>();
          for (const row of rows) {
            if (row.state === "uploaded" && row.key && row.sha256) {
              uploaded.set(row.id, { key: row.key, sha256: row.sha256 });
              continue;
            }
            try {
              abort.signal.throwIfAborted();
              patch(row.id, { state: "hashing" });
              const sha256 =
                row.sha256 ||
                Array.from(
                  new Uint8Array(
                    await crypto.subtle.digest(
                      "SHA-256",
                      await row.file.arrayBuffer(),
                    ),
                  ),
                  (byte) => byte.toString(16).padStart(2, "0"),
                ).join("");
              abort.signal.throwIfAborted();
              const grant =
                grants[pending.findIndex((item) => item.id === row.id)];
              patch(row.id, { state: "uploading", sha256 });
              const put = await fetch(grant.url, {
                method: "PUT",
                headers: { "Content-Type": row.file.type },
                body: row.file,
                signal: abort.signal,
              });
              if (!put.ok) throw new Error("Upload failed.");
              patch(row.id, { state: "verifying" });
              const response = await fetch("/api/uploads/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId, key: grant.key }),
                signal: abort.signal,
              });
              if (!response.ok) throw new Error("Upload verification failed.");
              patch(row.id, { state: "uploaded", key: grant.key, sha256 });
              uploaded.set(row.id, { key: grant.key, sha256 });
            } catch (cause) {
              if (abort.signal.aborted) throw cause;
              patch(row.id, { state: "failed" });
            }
          }
          if (uploaded.size !== rows.length)
            throw new Error(
              "Some files did not upload. Retry to send only those files. Keep this form open to reuse completed uploads.",
            );
          const capture = {
            organizationId,
            title:
              String(data.get("title") || "").trim() ||
              "Provided images and videos",
            assets: rows.map((row, index) => ({
              ...uploaded.get(row.id)!,
              index,
            })),
            ...(originalUrl ? { originalUrl } : {}),
            ...(data.get("caption")
              ? { caption: String(data.get("caption")) }
              : {}),
            rightsAttested: true,
          };
          const fingerprint = JSON.stringify(capture);
          if (submission.current?.fingerprint !== fingerprint)
            submission.current = { fingerprint, key: crypto.randomUUID() };
          abort.signal.throwIfAborted();
          const sourceId = await call("captureOrdered", {
            ...capture,
            key: submission.current.key,
          });
          abort.signal.throwIfAborted();
          if (typeof sourceId !== "string" || !sourceId)
            throw new Error(
              "The files uploaded, but saving was not confirmed. Retry to reuse them.",
            );
          onDone(sourceId);
        } catch (cause) {
          if (!abort.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "The files could not be saved. Try again.",
            );
        } finally {
          inFlight.current = false;
          if (!abort.signal.aborted) setBusy(false);
        }
      }}
    >
      <p>
        Save images, videos or a mixed carousel in the order you choose. Your
        source stays private. Saving does not start analysis.
      </p>
      {demo && (
        <p>
          This synthetic demo does not upload files. Sign in to save your own
          content.
        </p>
      )}
      <label>
        Title
        <input
          name="title"
          maxLength={160}
          placeholder="What are you saving?"
          disabled={busy || demo}
        />
      </label>
      <label>
        Images and videos
        <input
          name="files"
          type="file"
          multiple
          accept={allowedTypes.join(",")}
          disabled={busy || demo}
          onChange={(event) => {
            try {
              const selected = Array.from(event.currentTarget.files || []);
              if (!selected.length) return;
              validateOrderedFiles([
                ...rows.map((row) => row.file),
                ...selected,
              ]);
              setRows((current) => [
                ...current,
                ...selected.map((file) => ({
                  id: sequence.current++,
                  file,
                  state: "waiting" as const,
                })),
              ]);
              setError("");
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Choose supported files.",
              );
            }
            event.currentTarget.value = "";
          }}
        />
      </label>
      <p className="fine">
        1–35 JPEG, PNG, WebP, MP4 or WebM files, up to 250 MB together and 10
        minutes of video in total. Actual formats and durations are checked
        during preparation.
      </p>
      {!!rows.length && (
        <ol className="form-grid" aria-label="File order">
          {rows.map((row, index) => (
            <li key={row.id} className="form-grid">
              <span style={{ overflowWrap: "anywhere" }}>
                {index + 1}. {row.file.name} ·{" "}
                {(row.file.size / 1_000_000).toFixed(1)} MB
              </span>
              <output aria-label={`File ${index + 1} upload status`}>
                {
                  {
                    waiting: "Waiting to upload",
                    hashing: "Checking file",
                    uploading: "Uploading",
                    verifying: "Verifying upload",
                    uploaded: "Upload complete",
                    failed: "Upload failed. Retry available.",
                  }[row.state]
                }
              </output>
              <div className="actions">
                <button
                  className="secondary"
                  type="button"
                  aria-label={`Move file ${index + 1} up`}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  Move up
                </button>
                <button
                  className="secondary"
                  type="button"
                  aria-label={`Move file ${index + 1} down`}
                  disabled={busy || index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Move down
                </button>
                <button
                  className="secondary"
                  type="button"
                  aria-label={`Remove file ${index + 1}`}
                  disabled={busy}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item.id !== row.id),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <label>
        Original link, optional
        <input
          name="originalUrl"
          type="url"
          maxLength={2048}
          placeholder="https://..."
          disabled={busy || demo}
        />
      </label>
      <p className="fine">
        This link is your reference. It does not verify a creator, publication
        date or the completeness of a post.
      </p>
      <label>
        Caption or context, optional
        <textarea
          name="caption"
          maxLength={60000}
          rows={3}
          disabled={busy || demo}
        />
      </label>
      <label className="check">
        <input name="rights" type="checkbox" required disabled={busy || demo} />
        I may submit these files for processing.
      </label>
      <button className="primary" disabled={busy || demo || !rows.length}>
        {busy
          ? "Uploading and saving…"
          : rows.some(
                (row) => row.state === "failed" || row.state === "uploaded",
              )
            ? "Retry and save privately"
            : "Save files privately"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
