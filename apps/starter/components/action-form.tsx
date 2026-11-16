"use client";
import { useActionState } from "react";
import { Button } from "@companynerve/ui";
export type FormState = { error?: string; message?: string; link?: string };
export function ActionForm({
  action,
  children,
  label = "Save changes",
  pendingLabel = "Working…",
  danger = false,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  label?: string;
  pendingLabel?: string;
  danger?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="form-grid" aria-busy={pending}>
      {children}
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <output className="success" aria-live="polite">
          {state.message}
          {state.link && (
            <>
              {" "}
              <a href={state.link}>{state.link}</a>
            </>
          )}
        </output>
      )}
      <div>
        <Button
          type="submit"
          variant={danger ? "destructive" : "default"}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? pendingLabel : label}
        </Button>
      </div>
    </form>
  );
}
