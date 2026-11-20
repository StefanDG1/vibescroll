"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { ChoiceSelect } from "./choice-select";
import { ProjectMark } from "./project-mark";
import { WorkStatus } from "./work-screens";
import {
  profileFields,
  profileFieldNames as fields,
} from "../../../packages/repositories/business-context";
type Call = (operation: string, args: any) => Promise<any>;
export function RepositoryChecklist({
  organizationId,
  repositories,
  choices,
  call,
  readOnly,
  demo,
}: {
  organizationId: string;
  repositories: any[];
  choices: any[];
  call: Call;
  readOnly: boolean;
  demo: boolean;
}) {
  const [checked, setChecked] = useState(
      new Set(
        repositories
          .filter((r) => r.enabled && Number.isFinite(r.providerId))
          .map((r) => r.providerId),
      ),
    ),
    [search, setSearch] = useState(""),
    [installation, setInstallation] = useState(""),
    [page, setPage] = useState(0),
    [draft, setDraft] = useState(true),
    [startedAt, setStartedAt] = useState(0),
    [busy, setBusy] = useState(false),
    [paths, setPaths] = useState<Record<number, string>>(() =>
      Object.fromEntries(
        repositories.map((r) => [
          r.providerId,
          (r.snapshotPaths ?? []).join("\n"),
        ]),
      ),
    ),
    [progress, setProgress] = useState<any[]>([]);
  const filtered = choices.filter(
      (r) =>
        r.fullName.toLowerCase().includes(search.toLowerCase()) &&
        (!installation || String(r.installationId) === installation),
    ),
    visible = filtered.slice(page * 30, (page + 1) * 30),
    selected = choices.filter((r) => checked.has(r.id));
  const quote = draft
    ? selected.filter(
        (c) => !repositories.find((r) => r.providerId === c.id)?.confirmed,
      ).length * 10
    : 0;
  async function saveSelection() {
    setBusy(true);
    setStartedAt(Date.now());
    setProgress(
      selected.map((choice) => ({
        repository: choice.fullName,
        state: "preparing",
      })),
    );
    try {
      const result = await call("selectRepositories", {
        organizationId,
        choices: selected.map((choice) => ({
          installationId: choice.installationId,
          providerId: choice.id,
          fullName: choice.fullName,
          snapshotPaths: (paths[choice.id] ?? "")
            .split(/\r?\n/)
            .map((path) => path.trim())
            .filter(Boolean),
        })),
        draftContext: draft,
        maxCredits: quote,
      });
      if (result) setProgress(result);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel form-grid work-repository-choices">
      <h2>GitHub access</h2>
      {!readOnly && (
        <>
          <p>
            Choose which projects to improve. New repositories stay unselected
            until you add them.
          </p>
          <div className="actions">
            <a
              href="https://github.com/apps/vibescroller/installations/new"
              target="_blank"
              rel="noreferrer"
            >
              Install or change GitHub App access
            </a>
            {!demo && (
              <a href={`/api/github/connect?organizationId=${organizationId}`}>
                Link GitHub account
              </a>
            )}
            <button
              disabled={busy || demo}
              onClick={async () => {
                setBusy(true);
                try {
                  await call("refreshGithubChoices", { organizationId });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Refresh GitHub repositories
            </button>
          </div>
        </>
      )}
      {choices.length > 0 ? (
        <>
          <label>
            Search repository names
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Installation/account
            <ChoiceSelect
              value={installation}
              onValueChange={(value) => {
                setInstallation(value);
                setPage(0);
              }}
            >
              <option value="">All installations</option>
              {[...new Set(choices.map((r) => r.installationId))].map((i) => (
                <option key={i} value={i}>
                  Installation {i} ·{" "}
                  {
                    choices
                      .find((r) => r.installationId === i)
                      ?.fullName.split("/")[0]
                  }
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <p>
            {checked.size} selected · {filtered.length} authorized choices match
            · page {page + 1}
          </p>
          <button
            className="secondary"
            disabled={readOnly || busy}
            onClick={() => setChecked(new Set(choices.map((r) => r.id)))}
          >
            Select all authorized repositories ({choices.length})
          </button>
          <button
            disabled={readOnly || busy}
            onClick={() =>
              setChecked(
                (old) => new Set([...old, ...visible.map((r) => r.id)]),
              )
            }
          >
            Select all visible filtered choices ({visible.length})
          </button>
          <button
            disabled={readOnly || busy}
            onClick={() =>
              setChecked(
                (old) =>
                  new Set(
                    [...old].filter((id) => !visible.some((r) => r.id === id)),
                  ),
              )
            }
          >
            Clear visible choices
          </button>
          {visible.map((r) => (
            <div key={`${r.installationId}:${r.id}`}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={checked.has(r.id)}
                  disabled={readOnly || busy}
                  onChange={(e) =>
                    setChecked((old) => {
                      const next = new Set(old);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    })
                  }
                />
                {r.fullName}
              </label>
              {checked.has(r.id) && (
                <details>
                  <summary>
                    Advanced: limit repository coverage
                    {paths[r.id] ? " (a limit is active)" : ""}
                  </summary>
                  <label>
                    Optional coverage limit for {r.fullName}
                    <textarea
                      rows={3}
                      maxLength={4000}
                      value={paths[r.id] ?? ""}
                      disabled={readOnly || busy}
                      placeholder={"README.md\nsrc"}
                      onChange={(e) =>
                        setPaths((old) => ({ ...old, [r.id]: e.target.value }))
                      }
                    />
                    <span>
                      Whole-repository discovery is the default. You do not need
                      to choose files. Only use this limit when you
                      intentionally want to exclude other areas. Enter literal
                      paths, one per line; folders include their children.
                      Secrets and generated files remain excluded in every mode.
                    </span>
                  </label>
                  {!!paths[r.id] && (
                    <button
                      disabled={readOnly || busy}
                      onClick={() =>
                        setPaths((old) => ({ ...old, [r.id]: "" }))
                      }
                    >
                      Use the whole repository
                    </button>
                  )}
                </details>
              )}
            </div>
          ))}
          {!filtered.length && <p>No repositories match these filters.</p>}
          {repositories
            .filter(
              (r) => r.enabled && !choices.some((c) => c.id === r.providerId),
            )
            .map((r) => (
              <p key={r._id}>
                {r.fullName}: current access is unavailable. Refresh access or
                save the remaining selection to remove it.
              </p>
            ))}
          <div className="actions">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous choices
            </button>
            <button
              disabled={(page + 1) * 30 >= filtered.length}
              onClick={() => setPage(page + 1)}
            >
              Next choices
            </button>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
            />
            Draft business context with AI for unconfirmed projects (default)
          </label>
          <p>
            Preparation discovers the whole eligible repository and inspects a
            bounded set of foundational documents, roles and feature files.
            Context drafting reserves up to {quote} processing credits in total
            (10 per unconfirmed project). Confirmed profiles are preserved.
            Manual context works without AI funding. Existing budgets can refuse
            or pause individual projects.
          </p>
          <button
            className="primary"
            disabled={readOnly || busy || demo}
            onClick={saveSelection}
          >
            Save selection and prepare context · up to {quote} credits
          </button>
        </>
      ) : (
        <>
          <p>
            {repositories.some((repository) => repository.enabled)
              ? "Repository choices are unavailable. You can still review saved project context below."
              : "Link an authorized GitHub account to discover repositories."}
          </p>
          {!readOnly &&
            !demo &&
            repositories.some((repository) => repository.enabled) && (
              <details>
                <summary>Clear selected repositories</summary>
                <p>This removes all repositories from the active selection.</p>
                <button type="button" disabled={busy} onClick={saveSelection}>
                  Clear repository selection
                </button>
              </details>
            )}
        </>
      )}
      <output aria-live="polite">
        {progress.map((r) => {
          const current = repositories.find(
            (repo) =>
              repo.fullName === r.repository && repo.updatedAt >= startedAt,
          );
          const state =
            busy && current
              ? current.status === "connected"
                ? "ready"
                : current.status
              : r.state;
          return (
            <p key={r.repository}>
              {r.repository}: {state.replaceAll("_", " ")}
              {state === "needs_attention"
                ? preparationMessage(r.error ?? current?.preparationError)
                : ""}
            </p>
          );
        })}
      </output>
      {repositories
        .filter(
          (r) =>
            r.enabled &&
            r.status === "needs_attention" &&
            !progress.some((p) => p.repository === r.fullName),
        )
        .map((r) => (
          <output key={r._id}>
            {r.fullName}: {preparationMessage(r.preparationError)}
          </output>
        ))}
    </section>
  );
}
function preparationMessage(code?: string) {
  if (code === "REPO_TOO_LARGE")
    return ". Discovery could not complete within the current safety bounds. An active coverage limit may also exceed its bounded manifest. No complete-repository understanding or paid analysis is claimed. Review current access and preparation status before retrying.";
  if (code === "CONTEXT_REQUIRED")
    return ". A selected path has no eligible files. Check the literal path and repository ignore rules, then save again.";
  if (
    ["FORBIDDEN", "REAUTH_REQUIRED", "GITHUB_UNAVAILABLE"].includes(code ?? "")
  )
    return ". Repository access is unavailable. Review the GitHub connection and installation access, then refresh authorized choices.";
  return ". Preparation could not finish. Check current access and available processing credits before retrying; completed context drafts are reused.";
}
export function BusinessContext({
  repo: r,
  call,
  readOnly,
}: {
  repo: any;
  call: Call;
  readOnly: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <details
      id={`repository-${r._id ?? r.id}`}
      className="work-repository-context"
      onToggle={(event) => {
        if (event.currentTarget.open) setLoaded(true);
      }}
    >
      <summary>
        <ProjectMark name={r.fullName} />
        <span>{r.fullName}</span>
        <WorkStatus
          value={r.confirmed ? "connected" : "unreviewed"}
          label={r.confirmed ? "Context reviewed" : "Review context"}
        />
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      {loaded &&
        (readOnly ? (
          <BusinessContextSummary repo={r} />
        ) : (
          <BusinessContextFields repo={r} call={call} />
        ))}
    </details>
  );
}

type RepositoryContext = FunctionReturnType<
  typeof api.product.repositories
>[number];

function BusinessContextSummary({ repo }: { repo: RepositoryContext }) {
  const profile = repo.confirmed
    ? repo.profile
    : (repo.profileDraft ?? repo.profile);
  const coverage = repo.snapshotCoverage;
  return (
    <section
      className="work-context-fields work-context-summary"
      aria-label={`Business context for ${repo.fullName}`}
    >
      <dl className="work-context-metadata">
        <div>
          <dt>Context version</dt>
          <dd>{repo.profileVersion ?? "Pending"}</dd>
        </div>
        <div>
          <dt>Inspected commit</dt>
          <dd>
            {repo.sha ? (
              <code title={repo.sha}>{repo.sha.slice(0, 10)}</code>
            ) : (
              "Pending"
            )}
          </dd>
        </div>
        {coverage && (
          <div>
            <dt>Files inspected</dt>
            <dd>
              {coverage.inspectedFiles} of {coverage.includedFiles} eligible
            </dd>
          </div>
        )}
      </dl>
      <div className="work-context-document">
        <h3>{repo.confirmed ? "Reviewed context" : "Context draft"}</h3>
        <p>{profile || "No context is available yet."}</p>
      </div>
      {coverage && (
        <details className="work-context-sources">
          <summary>Snapshot evidence</summary>
          <ul>
            <li>
              {coverage.wholeRepository
                ? "Whole-repository discovery"
                : "Selected repository paths"}
            </li>
            {!!repo.snapshotPaths?.length && (
              <li>{repo.snapshotPaths.join(", ")}</li>
            )}
            {coverage.omittedFiles > 0 && (
              <li>
                {coverage.omittedFiles} files excluded by the coverage limit
              </li>
            )}
            {coverage.wordDocuments > 0 && (
              <li>{coverage.wordDocuments} Word documents inspected</li>
            )}
          </ul>
          {!!coverage.evidence?.length && (
            <ul>
              {coverage.evidence.map((entry) => (
                <li key={entry.path}>
                  <code>{entry.path}</code> · lines {entry.startLine}–
                  {entry.endLine}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {repo.confirmed && repo.profileDraft && repo.profileDraft !== profile && (
        <details className="work-context-sources">
          <summary>Unconfirmed draft</summary>
          <p>{repo.profileDraft}</p>
        </details>
      )}
    </section>
  );
}

function BusinessContextFields({ repo: r, call }: { repo: any; call: Call }) {
  const initial =
    (r.confirmed ? r.profile : (r.profileDraft ?? r.profile)) ?? "";
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        fields.map((field) => {
          const match = initial.match(
            new RegExp(
              `(?:^|\\n\\n)${field}: ([\\s\\S]*?)(?=\\n\\n(?:${fields.join("|")}):|$)`,
            ),
          );
          return [field, match?.[1] ?? "unknown"];
        }),
      ),
    ),
    [freeText, setFreeText] = useState(initial),
    [previousDraft, setPreviousDraft] = useState(r.profileDraft ?? ""),
    [manual, setManual] = useState(
      !fields.some((f) => initial.includes(`${f}:`)),
    ),
    [busy, setBusy] = useState(false);
  const profile = manual
    ? freeText
    : fields.map((f) => `${f}: ${values[f]}`).join("\n\n");
  return (
    <section
      className="form-grid work-context-fields"
      aria-label={`Business context for ${r.fullName}`}
    >
      <p>
        {r.confirmed
          ? "Confirmed business context. Later AI drafts propose changes for your review."
          : "AI proposes context from inspected repository evidence. Unknown facts stay unknown; review guesses before confirming."}
      </p>
      <p className="code-label">
        Inspected commit {r.sha || "Snapshot pending"}. Context version{" "}
        {r.profileVersion}.
      </p>
      <button
        type="button"
        disabled={
          busy ||
          !r.enabled ||
          !!r.profileDraftKey ||
          ["preparing", "drafting_context"].includes(r.status)
        }
        onClick={async () => {
          setBusy(true);
          try {
            await call("refreshRepository", {
              id: r._id,
              expectedSha: r.sha,
              expectedSelectionVersion: r.selectionVersion ?? 0,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy || r.status === "preparing"
          ? "Refreshing project…"
          : "Refresh repository snapshot"}
      </button>
      {!!r.snapshotPaths?.length && (
        <p>
          Selected snapshot paths: {r.snapshotPaths.join(", ")}. Evaluations
          cover this selection, not the whole repository.
        </p>
      )}
      {r.snapshotCoverage && (
        <p>
          {r.snapshotCoverage.wholeRepository
            ? "Whole-repository discovery"
            : "Selected coverage"}{" "}
          at {r.snapshotCoverage.baseSha}: {r.snapshotCoverage.includedFiles}{" "}
          eligible files discovered; {r.snapshotCoverage.omittedFiles} eligible
          files excluded by your coverage limit.{" "}
          {r.snapshotCoverage.inspectedFiles} files inspected for context,
          including {r.snapshotCoverage.wordDocuments} Word documents. Discovery
          is a file inventory, not a claim that every file or live screen was
          reviewed. Issue evaluation retrieves additional relevant files from
          the whole eligible tree.
        </p>
      )}
      <button
        disabled={busy || !r.enabled || !!r.profileDraftKey || !r.sha}
        onClick={async () => {
          setBusy(true);
          try {
            await call("draftProfile", { id: r._id, maxCredits: 10 });
          } finally {
            setBusy(false);
          }
        }}
      >
        Draft or refresh context · up to 10 credits
      </button>
      {!!r.snapshotCoverage?.evidence?.length && (
        <details>
          <summary>Files used for business context</summary>
          <ul>
            {r.snapshotCoverage.evidence.map((e: any) => (
              <li key={e.path} style={{ overflowWrap: "anywhere" }}>
                {e.path}: {e.wordDocument ? "extracted text" : "source"} lines{" "}
                {e.startLine} to {e.endLine}
              </li>
            ))}
          </ul>
          <p>
            Later evaluations inspect additional relevant files. A file
            inventory does not verify every feature or live screen.
          </p>
        </details>
      )}
      {r.profileDraftKey && (
        <p>
          Context request is pending or its usage needs reconciliation. A
          duplicate charge is blocked.
        </p>
      )}
      {r.profileDraft && (
        <details>
          <summary>
            Inspect unconfirmed context proposal and evidence basis
          </summary>
          <p>
            Based on permitted repository excerpts at {r.profileDraftSha};
            context version {r.profileDraftVersion}. AI suggestions and review
            edits remain unconfirmed until you approve the context.
          </p>
          <pre>{r.profileDraft}</pre>
          <button
            disabled={
              r.profileDraftSha !== r.sha ||
              r.profileDraftVersion !== r.profileVersion
            }
            onClick={() => {
              setManual(true);
              setFreeText(r.profileDraft);
              setPreviousDraft(r.profileDraft);
            }}
          >
            Review proposal in editor
          </button>
        </details>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={manual}
          disabled={busy}
          onChange={(e) => setManual(e.target.checked)}
        />
        Use a free-text profile (preserves existing profiles)
      </label>
      {manual ? (
        <label>
          Business context
          <textarea
            rows={9}
            value={freeText}
            readOnly={busy}
            maxLength={8000}
            onChange={(e) => setFreeText(e.target.value)}
          />
        </label>
      ) : (
        fields.map((f) => (
          <label key={f}>
            {profileFields[f].label}
            <textarea
              rows={2}
              maxLength={8000}
              value={values[f]}
              readOnly={busy}
              onChange={(e) =>
                setValues((old) => ({ ...old, [f]: e.target.value }))
              }
            />
          </label>
        ))
      )}
      <p>
        {profile.length} of 8,000 context characters.{" "}
        {profile.length > 8000
          ? "Shorten the context before saving or confirming; confirmed corrections have not changed."
          : "You can use more detail in the sections your project needs."}
      </p>
      <button
        className="secondary"
        disabled={
          busy ||
          !r.enabled ||
          !r.sha ||
          !!r.profileDraftKey ||
          !profile.trim() ||
          profile.length > 8000
        }
        onClick={async () => {
          setBusy(true);
          try {
            const result = await call("saveProfileDraft", {
              id: r._id,
              sha: r.sha,
              version: r.profileVersion,
              selectionVersion: r.selectionVersion ?? 0,
              previousDraft,
              profile,
            });
            if (result?.saved) setPreviousDraft(profile);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save review edits · no credits
      </button>
      <p>
        Saved edits remain a draft. Confirm context when you have reviewed the
        business facts.
      </p>
      <button
        className="primary"
        disabled={
          busy ||
          !r.enabled ||
          !r.sha ||
          !profile.trim() ||
          profile.length > 8000
        }
        onClick={async () => {
          setBusy(true);
          try {
            await call("confirmProfile", {
              id: r._id,
              sha: r.sha,
              version: r.profileVersion,
              selectionVersion: r.selectionVersion ?? 0,
              profile,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {r.confirmed ? "Confirm corrections" : "Looks right · confirm context"}
      </button>
    </section>
  );
}
