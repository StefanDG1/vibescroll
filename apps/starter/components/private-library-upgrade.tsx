"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";

const previewSchema = z.object({
  organizationId: z.string().min(1).max(256),
  organizationName: z.string().max(256),
  membershipId: z.string().min(1).max(256),
  eligible: z.boolean(),
  reason: z.enum([
    "eligible",
    "already_private",
    "owner_required",
    "creator_required",
    "shared_workspace",
    "invitation_check_limit",
    "pending_invitations",
    "other_private_workspace",
  ]),
  expectedVersion: z.string().min(1).max(4096),
  previewedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  preservesPosts: z.literal(true),
  preservesProjects: z.literal(true),
  teamInvitationsDisabled: z.literal(true),
});
type Preview = z.infer<typeof previewSchema>;
const reasons: Record<Preview["reason"], string> = {
  eligible: "You are the only member, and there are no active invitations.",
  already_private: "This library is already private. Reload this page.",
  owner_required: "Only the workspace owner can review this change.",
  creator_required: "Only the original workspace creator can make this change.",
  shared_workspace:
    "This workspace has other members. Keep it as a team workspace and use a separate private library.",
  invitation_check_limit:
    "The invitation history needs review before this workspace can become private.",
  pending_invitations:
    "Revoke active invitations before reviewing this change again.",
  other_private_workspace:
    "You already have a private library. Open it from Your workspaces.",
};

async function request(operation: string, args: unknown) {
  const response = await fetch("/api/product", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, args }),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(
      typeof value.error === "string"
        ? value.error.slice(0, 500)
        : "This change could not be completed. Review its current state before trying again.",
    );
  return value.result;
}

export function PrivateLibraryUpgrade({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <PrivateLibraryUpgradePanel
      key={organizationId}
      organizationId={organizationId}
    />
  );
}

export function PrivateLibraryUpgradePanel({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function perform(adopt: boolean) {
    if (inFlight.current || (adopt && (!acknowledged || !preview?.eligible)))
      return;
    if (adopt && preview && preview.expiresAt <= Date.now()) {
      setPreview(null);
      setAcknowledged(false);
      setError("This review expired. Review the workspace again.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      if (!adopt) {
        setPreview(null);
        setAcknowledged(false);
        const value = previewSchema.parse(
          await request("previewPrivateAdoption", { organizationId }),
        );
        if (
          value.organizationId !== organizationId ||
          value.expiresAt <= Date.now() ||
          value.previewedAt > Date.now()
        )
          throw Error("The workspace review changed. Review it again.");
        setPreview(value);
      } else if (preview) {
        const value = z
          .object({
            organizationId: z.string(),
            status: z.enum(["adopted", "already_private"]),
          })
          .parse(
            await request("adoptPrivateLibrary", {
              organizationId,
              expectedVersion: preview.expectedVersion,
              previewedAt: preview.previewedAt,
              acknowledgePrivateOnly: true,
            }),
          );
        if (value.organizationId !== organizationId)
          throw Error("The workspace changed. Reload this page.");
        setComplete(true);
        setPreview(null);
        setAcknowledged(false);
        router.refresh();
      }
    } catch (cause) {
      setPreview(null);
      setAcknowledged(false);
      setError(
        cause instanceof Error && !(cause instanceof z.ZodError)
          ? cause.message
          : "The workspace review could not be verified. Review it again.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <section
      id="private-library"
      className="card form-grid"
      aria-busy={pending}
    >
      <h2>Use this workspace as your private library</h2>
      <p>
        Keep your existing posts, projects and links here. A private library is
        required for experimental own-subscription Work Cloud analysis.
      </p>
      <p>
        Only you can access a private library. Invitations and ownership
        transfer are unavailable here. Use a separate team workspace for
        collaboration. This change does not start analysis or add processing
        permissions.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
          {error.includes("Sign in again") && (
            <>
              {" "}
              <Link
                prefetch={false}
                href={`/sign-in?reauth=true&returnTo=${encodeURIComponent(`/app/${organizationId}/team`)}`}
              >
                Sign in again to review this change
              </Link>
            </>
          )}
        </p>
      )}
      {complete ? (
        <output aria-live="polite">
          Your library is now private.{" "}
          <Link prefetch={false} href={`/app/${organizationId}/library`}>
            Open your posts
          </Link>
        </output>
      ) : (
        <>
          {preview && (
            <output aria-live="polite">{reasons[preview.reason]}</output>
          )}
          {preview?.eligible && (
            <label className="check">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={pending}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I understand that this workspace will be accessible only to me,
              and I will use a separate workspace for a team.
            </label>
          )}
          <div className="inline-actions">
            <button
              className="secondary"
              disabled={pending}
              onClick={() => perform(false)}
            >
              {pending ? "Working…" : "Review private-library upgrade"}
            </button>
            {preview?.eligible && (
              <button
                className="primary"
                disabled={pending || !acknowledged}
                onClick={() => perform(true)}
              >
                Make this library private
              </button>
            )}
          </div>
          <Link prefetch={false} href="/app/workspaces">
            Choose or create a separate private library
          </Link>
        </>
      )}
    </section>
  );
}
