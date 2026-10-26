import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { Action, Failure, Loading } from "./components";
import { useHost } from "./host";
import { categoryName } from "../../../packages/categories";
import type { ToolRecord } from "../../../packages/widget/contracts";
import {
  libraryEditInput,
  libraryEditOutcome,
  libraryEditState,
  libraryEditResult,
  verifiedLibraryEditReceipt,
  type LibraryEdit,
  type LibraryEditState,
} from "../../../packages/widget/library-edits";

type Props = {
  profileId: string;
  grantVersion: number;
  topicId: string;
  candidates: ToolRecord[];
  notify: (message: string) => void;
};

export function TopicEditor(props: Props) {
  const host = useHost();
  const cache = useQueryClient();
  // Native details hides its contents without discarding an unresolved command.
  const [revealed, setRevealed] = useState(false);
  const authority = `${props.profileId}:${props.grantVersion}`;
  const state = useQuery({
    queryKey: ["data", authority, "topic-edit", props.topicId],
    enabled: revealed,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = libraryEditState.parse(
        await host.call("widget_library_state", {
          profileId: props.profileId,
          grantVersion: props.grantVersion,
          topicId: props.topicId,
        }),
      );
      if (
        result.profile_id !== props.profileId ||
        result.grant_version !== props.grantVersion ||
        result.topic.id !== props.topicId
      )
        throw new Error(
          "The topic does not match this connection. Reload access.",
        );
      return result;
    },
  });
  const load = async () => {
    const result = await state.refetch();
    if (result.error || !result.data)
      throw result.error ?? new Error("The topic is unavailable.");
    return result.data;
  };
  return (
    <details
      className="topic-editor"
      onToggle={(event) => {
        if (event.currentTarget.open) setRevealed(true);
      }}
    >
      <summary>Organize topic</summary>
      {revealed &&
        (state.isPending ? (
          <Loading label="Loading current topic" />
        ) : state.error ? (
          <>
            <Failure error={state.error} />
            <Action secondary onClick={() => void state.refetch()}>
              Reload topic
            </Action>
          </>
        ) : state.data ? (
          <TopicEditorForm
            key={`${state.data.topic.version}:${state.data.topic.layout_version}`}
            {...props}
            data={state.data}
            load={load}
            saved={() =>
              void cache.invalidateQueries({ queryKey: ["data", authority] })
            }
          />
        ) : null)}
    </details>
  );
}

function TopicEditorForm({
  profileId,
  grantVersion,
  topicId,
  candidates,
  data,
  notify,
  load,
  saved,
}: Props & {
  data: LibraryEditState;
  load: () => Promise<LibraryEditState>;
  saved: () => void;
}) {
  const host = useHost();
  const prefix = useId();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [name, setName] = useState(data.topic.name);
  const [parent, setParent] = useState(data.topic.parent_id ?? "");
  const [aliases, setAliases] = useState(data.topic.aliases.join("\n"));
  const [request, setRequest] = useState<LibraryEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const finish = (input: LibraryEdit, value: unknown) => {
    verifiedLibraryEditReceipt(value, input);
    if (!active.current) return;
    setRequest(null);
    notify(
      input.change.kind === "rename"
        ? "Topic renamed."
        : input.change.kind === "pin"
          ? "Topic pin updated."
          : "Topic folder and aliases saved.",
    );
    saved();
  };
  const submit = async (
    change: LibraryEdit["change"],
    previous?: LibraryEdit,
  ) => {
    let input: LibraryEdit;
    try {
      input =
        previous ??
        libraryEditInput.parse({
          profileId,
          grantVersion,
          topicId,
          expectedVersion: data.topic.version,
          expectedLayoutVersion: data.topic.layout_version,
          key: crypto.randomUUID(),
          change,
          explicitlyRequested: true,
        });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Review the topic fields.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setRetryAllowed(false);
    setRequest(input);
    try {
      const result = await host.call("widget_library_edit", input);
      const parsed = libraryEditResult.parse(result);
      if ("status" in parsed) {
        if (
          parsed.profile_id !== profileId ||
          parsed.grant_version !== grantVersion ||
          parsed.topic_id !== topicId ||
          parsed.request_key !== input.key
        )
          throw new Error("The rejection does not match this change.");
        if (active.current) {
          setRequest(null);
          setError(parsed.message);
        }
        return;
      }
      finish(input, parsed);
    } catch {
      if (active.current)
        setError(
          "The change is not confirmed. Check its result before retrying.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const check = async () => {
    if (!request) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = libraryEditOutcome.parse(
        await host.call("widget_library_receipt", {
          profileId,
          grantVersion,
          topicId,
          key: request.key,
        }),
      );
      if (
        result.profile_id !== profileId ||
        result.grant_version !== grantVersion
      )
        throw new Error("The result does not match this connection.");
      if (result.receipt) finish(request, result.receipt);
      else if (active.current) {
        setRetryAllowed(true);
        setMessage(
          "No receipt is confirmed yet. Retrying sends the same change and request key.",
        );
      }
    } catch {
      if (active.current)
        setError(
          "The result is still unavailable. Review your connection or check again.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const review = async () => {
    setBusy(true);
    setError("");
    try {
      const current = await load();
      if (!active.current) return;
      setName(current.topic.name);
      setParent(current.topic.parent_id ?? "");
      setAliases(current.topic.aliases.join("\n"));
      setRequest(null);
      setRetryAllowed(false);
      setMessage("Current topic loaded. Review it before making a new change.");
    } catch {
      if (active.current)
        setError("Current access could not be confirmed. Review Connections.");
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const fieldsDisabled = busy || request !== null;
  const parents = candidates.filter(
    (row) => typeof row.id === "string" && row.id !== topicId,
  );
  const currentParentMissing =
    !!data.topic.parent_id &&
    !parents.some((row) => row.id === data.topic.parent_id);
  return (
    <div className="topic-editor-body">
      <p className="muted">
        Names, pins and folders only. These changes start no processing.
      </p>
      <fieldset disabled={fieldsDisabled}>
        <legend>Topic name</legend>
        <label htmlFor={`${prefix}-name`}>Name</label>
        <input
          id={`${prefix}-name`}
          value={name}
          maxLength={48}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="muted">Use 1 to 48 letters, numbers or spaces.</p>
        <Action
          secondary
          disabled={!name.trim() || name === data.topic.name}
          onClick={() => {
            try {
              void submit({ kind: "rename", name: categoryName(name) });
            } catch (reason) {
              setError(
                reason instanceof Error ? reason.message : "Review the name.",
              );
            }
          }}
        >
          Rename topic
        </Action>
        <Action
          secondary
          onClick={() =>
            void submit({ kind: "pin", pinned: !data.topic.pinned })
          }
        >
          <Pin size={15} />
          {data.topic.pinned ? "Unpin topic" : "Pin topic"}
        </Action>
      </fieldset>
      <fieldset disabled={fieldsDisabled}>
        <legend>Folder and aliases</legend>
        <label htmlFor={`${prefix}-parent`}>Folder</label>
        <select
          id={`${prefix}-parent`}
          value={parent}
          onChange={(event) => setParent(event.target.value)}
        >
          <option value="">Top level</option>
          {currentParentMissing && (
            <option value={data.topic.parent_id!}>
              Current folder, outside this page
            </option>
          )}
          {parents.map((row) => (
            <option key={String(row.id)} value={String(row.id)}>
              {String(row.name)}
            </option>
          ))}
        </select>
        <p className="muted">
          Choices come from the current loaded page of topics.
        </p>
        <label htmlFor={`${prefix}-aliases`}>Alternative names</label>
        <textarea
          id={`${prefix}-aliases`}
          value={aliases}
          rows={3}
          maxLength={1280}
          onChange={(event) => setAliases(event.target.value)}
        />
        <p className="muted">Up to 8 names, one per line.</p>
        <Action
          secondary
          disabled={
            parent === (data.topic.parent_id ?? "") &&
            aliases === data.topic.aliases.join("\n")
          }
          onClick={() => {
            try {
              const names = aliases
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean)
                .map(categoryName);
              if (names.length > 8)
                throw new Error("Use up to eight alternative names.");
              void submit({
                kind: "structure",
                parentId: parent || null,
                aliases: names,
              });
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Review the folder and names.",
              );
            }
          }}
        >
          Save folder and aliases
        </Action>
      </fieldset>
      {busy && (
        <Loading
          label={request ? "Confirming topic change" : "Loading current topic"}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {message && <output>{message}</output>}
      {request && (
        <div className="topic-editor-recovery">
          <Action secondary disabled={busy} onClick={() => void check()}>
            Check change result
          </Action>
          {retryAllowed && (
            <Action
              secondary
              disabled={busy}
              onClick={() => void submit(request.change, request)}
            >
              Retry same change
            </Action>
          )}
        </div>
      )}
      {(request || error) && (
        <Action secondary disabled={busy} onClick={() => void review()}>
          Review current topic
        </Action>
      )}
    </div>
  );
}
