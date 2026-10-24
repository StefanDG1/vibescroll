"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const grantSchema = z.object({
  id: z.string().min(1).max(256),
  clientId: z.string().min(1).max(256),
  version: z.number().int().positive(),
  state: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.number().finite().positive().nullable(),
});
const setupSchema = z.object({
  enabled: z.boolean(),
  workCloudTextEnabled: z.boolean(),
  workCloudMediaEnabled: z.boolean().optional().default(false),
  grants: z.array(grantSchema).max(51),
});
const previewBase = z.strictObject({
  sourceId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  approvedGeneration: z.number().int().nonnegative(),
  grantId: z.string().min(1),
  grantVersion: z.number().int().positive(),
  inputHash: hash,
  policyHash: hash,
  inputCharacters: z.number().int().nonnegative(),
  maxApiUsd: z.literal(0),
});
const previewSchema = z.discriminatedUnion("mediaSupported", [
  previewBase.extend({
    inputKind: z.enum(["source_text", "supplied_text"]),
    mediaSupported: z.literal(false),
  }),
  previewBase.extend({
    inputKind: z.literal("media"),
    mediaSupported: z.literal(true),
    retainUntil: z.number().int().positive().max(8_640_000_000_000_000),
    toolchainHash: hash,
  }),
]);
const queuedSchema = z.strictObject({
  sourceId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  state: z.literal("queued"),
  expiresAt: z.number().finite().positive().max(8_640_000_000_000_000),
  inputHash: hash,
});
const effortSchema = z.enum(["low", "medium", "high", "xhigh"]);
type Grant = z.infer<typeof grantSchema>;
type Preview = z.infer<typeof previewSchema>;
type Queued = z.infer<typeof queuedSchema>;
function observedTime() {
  return Date.now();
}
function retentionDeadline(value: number) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC"
  );
}
function grantCurrent(grant: Grant, now: number) {
  return (
    grant.state === "active" &&
    grant.scopes.includes("analysis:execute") &&
    (grant.expiresAt === null || grant.expiresAt > now)
  );
}
export type WorkCloudTextProps = {
  sourceId: string;
  organizationId: string;
  generation: number;
  revision: number;
  call: (operation: string, args: Record<string, unknown>) => Promise<any>;
  disabled?: boolean;
  media?: boolean;
  retentionUntil?: number;
};

export function WorkCloudText(props: WorkCloudTextProps) {
  return (
    <WorkCloudTextPanel
      key={JSON.stringify([
        props.sourceId,
        props.organizationId,
        props.generation,
        props.revision,
        Boolean(props.disabled),
        Boolean(props.media),
        props.retentionUntil ?? null,
      ])}
      {...props}
    />
  );
}

export function WorkCloudTextPanel({
  sourceId,
  organizationId,
  generation,
  call,
  disabled = false,
  media = false,
  retentionUntil,
}: WorkCloudTextProps) {
  const kind = media ? "video" : "text";
  const [mediaRetainUntil] = useState(() =>
    Math.min(retentionUntil ?? Infinity, observedTime() + 30 * 86400000),
  );
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [grantId, setGrantId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [model, setModel] = useState(media ? "gpt-6.1-sol" : "");
  const [effort, setEffort] = useState(media ? "medium" : "");
  const [consent, setConsent] = useState<string | null>(null);
  const [queued, setQueued] = useState<Queued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => observedTime());
  const alive = useRef(true);
  const request = useRef(0);
  const pending = useRef(false);
  const selectedGrant = useRef("");
  const selectionVersion = useRef(0);
  const [selection, setSelection] = useState(0);
  useEffect(() => {
    alive.current = true;
    const lifetime = alive;
    const requests = request;
    return () => {
      lifetime.current = false;
      requests.current++;
    };
  }, []);
  const current = (ticket: number) =>
    alive.current && request.current === ticket;
  const grant = grants?.find((item) => item.id === grantId);
  const binding = preview
    ? JSON.stringify([preview, model.trim(), effort])
    : null;
  function begin() {
    pending.current = true;
    setBusy(true);
    setError("");
    setConsent(null);
    return ++request.current;
  }
  function finish(ticket: number) {
    if (current(ticket)) {
      pending.current = false;
      setBusy(false);
    }
  }
  function fail(ticket: number) {
    if (!current(ticket)) return;
    setPreview(null);
    setConsent(null);
    setSelection(++selectionVersion.current);
    setError(
      `This approval could not be confirmed. Review Work Cloud ${kind} again to check the current source, connection and permissions.`,
    );
  }
  function resetPreview() {
    request.current++;
    pending.current = false;
    setBusy(false);
    setPreview(null);
    setConsent(null);
    setQueued(null);
    setError("");
    setSelection(++selectionVersion.current);
  }
  function resetConsent() {
    setConsent(null);
    setSelection(++selectionVersion.current);
  }
  async function review() {
    if (!alive.current || disabled || pending.current) return;
    const ticket = begin();
    setGrants(null);
    setGrantId("");
    selectedGrant.current = "";
    setPreview(null);
    setQueued(null);
    setSelection(++selectionVersion.current);
    try {
      const result = setupSchema.parse(
        await call("assistantSetup", { organizationId }),
      );
      if (!current(ticket)) return;
      if (
        !result.enabled ||
        !(media ? result.workCloudMediaEnabled : result.workCloudTextEnabled)
      )
        throw Error("Experimental route unavailable");
      const now = observedTime();
      setCheckedAt(now);
      setGrants(result.grants.filter((item) => grantCurrent(item, now)));
    } catch {
      fail(ticket);
    } finally {
      finish(ticket);
    }
  }
  async function inspect() {
    if (
      !alive.current ||
      disabled ||
      pending.current ||
      !grant ||
      selectedGrant.current !== grant.id
    )
      return;
    if (!grantCurrent(grant, observedTime())) {
      setPreview(null);
      setConsent(null);
      setCheckedAt(observedTime());
      setError(
        `The selected connection has expired or lost analysis permission. Review Work Cloud ${kind} again.`,
      );
      return;
    }
    const ticket = begin();
    setPreview(null);
    const expectedSelection = selectionVersion.current;
    try {
      const result = previewSchema.parse(
        await call("workCloudTextPreview", {
          sourceId,
          grantId: grant.id,
          ...(media
            ? { inputKind: "media", retainUntil: mediaRetainUntil }
            : {}),
        }),
      );
      if (!current(ticket) || expectedSelection !== selectionVersion.current)
        return;
      if (
        result.sourceId !== sourceId ||
        result.generation !== generation ||
        result.approvedGeneration !== generation + 1 ||
        result.grantId !== grant.id ||
        result.grantVersion !== grant.version ||
        result.mediaSupported !== media ||
        (result.mediaSupported && result.retainUntil !== mediaRetainUntil) ||
        !grantCurrent(grant, observedTime())
      )
        throw Error("Stale preview");
      setPreview(result);
      setCheckedAt(observedTime());
    } catch {
      fail(ticket);
    } finally {
      finish(ticket);
    }
  }
  async function approve() {
    if (
      !alive.current ||
      disabled ||
      pending.current ||
      !preview ||
      !grant ||
      !binding ||
      consent !== binding ||
      selection !== selectionVersion.current ||
      selectedGrant.current !== grant.id
    )
      return;
    const chosenEffort = effortSchema.safeParse(effort);
    const chosenModel = model.trim();
    if (
      !chosenEffort.success ||
      !chosenModel ||
      chosenModel.length > 100 ||
      !grantCurrent(grant, observedTime())
    ) {
      setConsent(null);
      setPreview(null);
      setError(
        "Review the current connection, model and effort before approving.",
      );
      return;
    }
    const ticket = begin();
    try {
      const result = queuedSchema.parse(
        await call("workCloudTextApprove", {
          sourceId,
          generation: preview.generation,
          grantId: preview.grantId,
          grantVersion: preview.grantVersion,
          expectedInputHash: preview.inputHash,
          model: chosenModel,
          effort: chosenEffort.data,
          useOwnPlan: true,
          maxApiUsd: 0,
          ...(preview.mediaSupported
            ? { inputKind: "media", retainUntil: preview.retainUntil }
            : {}),
        }),
      );
      if (!current(ticket)) return;
      if (
        result.sourceId !== sourceId ||
        result.generation !== preview.approvedGeneration ||
        result.inputHash !== preview.inputHash ||
        result.expiresAt <= observedTime()
      )
        throw Error("Invalid queue receipt");
      setQueued(result);
      setPreview(null);
      setConsent(null);
      setSelection(++selectionVersion.current);
      selectedGrant.current = "";
    } catch {
      fail(ticket);
    } finally {
      finish(ticket);
    }
  }
  const instructions = queued
    ? `In this official Work Cloud session, use the VibeScroll plugin to analyze sourceId ${queued.sourceId}, generation ${queued.generation}. Create one unique correlation UUID for this attempt and pass it as taskId to work_cloud_claim. This is a client correlation identifier, not a provider-attested task ID. Keep it and the returned lease token unchanged for input, heartbeat, ${media ? "prepare, " : ""}complete or fail. Follow the returned ${kind} policy and requested model/effort. ${media ? "Verify current restricted network policy and host resource controls before acquiring the exact source. Reuse only verified cached tools/models. Inspect actual speech and sampled frames, bind the evidence with work_cloud_prepare, then submit cited final analysis through work_cloud_complete. " : ""}Stop if tools, source rights, host controls or requested settings are unavailable; report the actual failure without a paid fallback or substitute result. Do not disclose credentials, lease tokens or private source bytes in the chat. This approval does not launch a host automatically. Host execution, model settings, cancellation and retention are not provider-attested by VibeScroll.`
    : "";
  return (
    <section
      className="panel"
      aria-label={`Experimental Work Cloud ${kind}`}
      aria-busy={busy}
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h2>Experimental Work Cloud {kind}</h2>
      <p>
        {media
          ? "Review one public video link for analysis in your own eligible Work Cloud session. GitHub and a paired computer are not required. This experimental route covers one video with sampled visual evidence; photos and carousels need their supported route."
          : "Review one text-only analysis through your own eligible subscription in an official Work Cloud task. No installation or GitHub connection is required. This does not process video, images or audio."}{" "}
        This approval does not wake a background task.
      </p>
      <p>
        Paid API fallback is disabled, with a maximum API spend of US$0. Your
        host's subscription limits still apply. VibeScroll has not verified the
        requested model, effort or host eligibility. The output stays private
        and is not published to the catalog.
      </p>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void review()}
      >
        Review Work Cloud {kind}
      </button>
      {busy && <output>Checking the current approval…</output>}
      {error && <p role="alert">{error}</p>}
      {grants && !queued && (
        <div className="form-grid">
          {grants.length === 0 ? (
            <p>
              No active connection with analysis:execute permission was found.
              Review your assistant connection settings, then return here.
            </p>
          ) : (
            <>
              <label>
                Assistant connection
                <select
                  style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
                  value={grantId}
                  disabled={disabled || busy}
                  onChange={(event) => {
                    resetPreview();
                    selectedGrant.current = event.target.value;
                    setGrantId(event.target.value);
                  }}
                >
                  <option value="">Choose a connection</option>
                  {grants.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      disabled={!grantCurrent(item, checkedAt)}
                    >
                      {item.clientId} · grant {item.id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={
                  disabled || busy || !grant || !grantCurrent(grant, checkedAt)
                }
                onClick={() => void inspect()}
              >
                Preview {kind} approval
              </button>
            </>
          )}
          {preview && (
            <section aria-label={`Exact ${kind} approval preview`}>
              <h3>Review this {kind} approval</h3>
              {preview.mediaSupported ? (
                <p>
                  Review the saved video shown above. Approving it lets your
                  selected Work Cloud connection process this video once.
                </p>
              ) : (
                <p>
                  <>
                    {preview.inputCharacters} characters of{" "}
                    {preview.inputKind === "supplied_text"
                      ? "supplied text"
                      : "source text"}
                  </>
                  . Current generation {preview.generation}; approved generation{" "}
                  {preview.approvedGeneration}. This preview grants no
                  processing permission.
                </p>
              )}
              {preview.mediaSupported && (
                <p>
                  This private result and its retained evidence expire on{" "}
                  {retentionDeadline(preview.retainUntil)}. Raw media stays in
                  your provider environment with a 24-hour cleanup target.
                  Provider file and chat-history deletion cannot be verified
                  here. No catalog publication is approved.
                </p>
              )}
              <details>
                <summary>Inspect approval fingerprints</summary>
                <p>
                  Input hash: <code>{preview.inputHash}</code>
                </p>
                <p>
                  Policy hash: <code>{preview.policyHash}</code>
                </p>
                <p>Connection version: {preview.grantVersion}</p>
              </details>
              <details open={!media}>
                <summary>
                  Processing settings{media ? ` · ${model}, ${effort}` : ""}
                </summary>
                <label>
                  Requested model
                  <input
                    type="text"
                    style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
                    value={model}
                    maxLength={100}
                    disabled={disabled || busy}
                    onChange={(event) => {
                      setModel(event.target.value);
                      resetConsent();
                    }}
                  />
                </label>
                <p>
                  Enter the model identifier supported by your current official
                  host. Availability is not verified here.
                </p>
                <label>
                  Requested reasoning effort
                  <select
                    value={effort}
                    disabled={disabled || busy}
                    onChange={(event) => {
                      setEffort(event.target.value);
                      resetConsent();
                    }}
                  >
                    <option value="">Choose effort</option>
                    {["low", "medium", "high", "xhigh"].map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </details>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent !== null && consent === binding}
                  disabled={
                    disabled ||
                    busy ||
                    !model.trim() ||
                    model.trim().length > 100 ||
                    !effortSchema.safeParse(effort).success
                  }
                  onChange={(event) =>
                    setConsent(event.target.checked ? binding : null)
                  }
                />
                I approve this exact {kind}, connection, requested model and
                effort
                {preview.mediaSupported
                  ? ", sampled evidence and the stated retention deadline"
                  : ""}{" "}
                using my own plan, with no paid API fallback.
              </label>
              <button
                type="button"
                disabled={disabled || busy || !binding || consent !== binding}
                onClick={() => void approve()}
              >
                Approve one {kind} analysis
              </button>
            </section>
          )}
        </div>
      )}
      {queued && (
        <section aria-label={`Queued ${kind} handoff`}>
          <h3>{media ? "Video" : "Text"} approval queued</h3>
          <p>
            This is an approval receipt, not a completed analysis. The one-shot
            handoff expires within 15 minutes, at{" "}
            {new Date(queued.expiresAt).toISOString()}.
          </p>
          <label>
            Instructions for your current official Work Cloud task
            <textarea
              readOnly
              rows={7}
              value={instructions}
              style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
            />
          </label>
          <p>
            Copy these instructions into your current official host task. Use
            one unique correlation ID for the attempt. Check the existing source
            status manually after the host returns its result; this panel does
            not poll or start the host.
          </p>
        </section>
      )}
    </section>
  );
}
