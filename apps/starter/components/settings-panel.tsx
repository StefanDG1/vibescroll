"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Settings2, X } from "lucide-react";

export function SettingsPanel({
  title,
  triggerLabel,
  children,
  trigger: triggerContent,
  open: controlled,
  onOpenChange,
}: {
  title: string;
  triggerLabel: string;
  children: ReactNode;
  trigger?: ReactNode | false;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const open = controlled ?? localOpen;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const titleId = useId();
  if (open && !mounted) setMounted(true);
  function change(value: boolean) {
    if (value) setMounted(true);
    setLocalOpen(value);
    onOpenChange?.(value);
  }
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      if (!element.open) {
        previousFocus.current = document.activeElement;
        element.showModal();
      }
    } else if (element.open) {
      element.close();
      const previous = previousFocus.current;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
      else trigger.current?.focus({ preventScroll: true });
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const dismiss = (event: MouseEvent) => {
      if (event.target !== element) return;
      setLocalOpen(false);
      onOpenChange?.(false);
    };
    element.addEventListener("click", dismiss);
    return () => element.removeEventListener("click", dismiss);
  }, [onOpenChange]);
  return (
    <>
      {triggerContent !== false && (
        <button
          ref={trigger}
          type="button"
          className="post-settings-trigger icon-button"
          aria-label={triggerLabel}
          title={triggerLabel}
          onClick={() => change(true)}
        >
          {triggerContent ?? <Settings2 size={19} aria-hidden="true" />}
        </button>
      )}
      <dialog
        ref={dialog}
        className="post-settings-drawer"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          change(false);
        }}
        onClose={() => {
          setLocalOpen(false);
          onOpenChange?.(false);
        }}
      >
        <div className="post-settings-content">
          <header>
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close settings"
              onClick={() => change(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {mounted && children}
        </div>
      </dialog>
    </>
  );
}
