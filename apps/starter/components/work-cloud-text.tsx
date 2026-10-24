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
  grants: z.array(grantSchema).max(51),
});
const previewSchema = z.strictObject({
  sourceId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  approvedGeneration: z.number().int().nonnegative(),
  grantId: z.string().min(1),
  grantVersion: z.number().int().positive(),
  inputHash: hash,
  policyHash: hash,
  inputKind: z.enum(["source_text", "supplied_text"]),
  inputCharacters: z.number().int().nonnegative(),
  maxApiUsd: z.literal(0),
  mediaSupported: z.literal(false),
});
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
}: WorkCloudTextProps) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [grantId, setGrantId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
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
      "This approval could not be confirmed. Review Work Cloud text again to check the current source, connection and permissions.",
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
      if (!result.enabled || !result.workCloudTextEnabled)
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
        "The selected connection has expired or lost analysis permission. Review Work Cloud text again.",
      );
      return;
    }
    const ticket = begin();
    setPreview(null);
    const expectedSelection = selectionVersion.current;
    try {
      const result = previewSchema.parse(
        await call("workCloudTextPreview", { sourceId, grantId: grant.id }),
      );
      if (!current(ticket) || expectedSelection !== selectionVersion.current)
        return;
      if (
        result.sourceId !== sourceId ||
        result.generation !== generation ||
        result.approvedGeneration !== generation + 1 ||
        result.grantId !== grant.id ||
        result.grantVersion !== grant.version ||
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
    ? `In your current official Work Cloud task, explicitly invoke the VibeScroll tool work_cloud_claim for sourceId ${queued.sourceId} and generation ${queued.generation}. Supply this task's actual current host task ID when the tool requests it. Do not invent a task ID, credential or token. Follow the returned text-only task instructions under your own eligible subscription. There is no paid API fallback or media processing in this approval.`
    : "";
  return (
    <section
      className="panel"
      aria-label="Experimental Work Cloud text"
      aria-busy={busy}
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h2>Experimental Work Cloud text</h2>
      <p>
        Review one text-only analysis through your own eligible subscription in
        an official Work Cloud task. No installation or GitHub connection is
        required. This does not process video, images or audio, or wake a
        background task.
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
        Review Work Cloud text
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
                Preview text approval
              </button>
            </>
          )}
          {preview && (
            <section aria-label="Exact text approval preview">
              <h3>Review this text approval</h3>
              <p>
                {preview.inputCharacters} characters of{" "}
                {preview.inputKind === "supplied_text"
                  ? "supplied text"
                  : "source text"}
                . Current generation {preview.generation}; approved generation{" "}
                {preview.approvedGeneration}. This preview grants no processing
                permission.
              </p>
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
                I approve this exact text, connection, requested model and
                effort using my own plan, with no paid API fallback.
              </label>
              <button
                type="button"
                disabled={disabled || busy || !binding || consent !== binding}
                onClick={() => void approve()}
              >
                Approve one text analysis
              </button>
            </section>
          )}
        </div>
      )}
      {queued && (
        <section aria-label="Queued text handoff">
          <h3>Text approval queued</h3>
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
            its real task ID. Check the existing source status manually after
            the host returns its result; this panel does not poll or start the
            host.
          </p>
        </section>
      )}
    </section>
  );
}
