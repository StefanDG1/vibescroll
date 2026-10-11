"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { ProposalLink } from "./proposal-link";
import type { BadgeProposal } from "../../../packages/knowledge/proposal-badges";

export function ProposalDrilldown({
  title,
  items,
  topics,
  demo,
  organizationId,
  origin,
  onClose,
}: {
  title: string;
  items: BadgeProposal[];
  topics: { id: string; name: string; parentId?: string }[];
  demo: boolean;
  organizationId: string;
  origin: HTMLElement | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId(),
    descriptionId = useId();
  const [visible, setVisible] = useState(5);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (
        origin?.isConnected &&
        origin.getClientRects().length &&
        !origin.closest("[inert]")
      ) {
        origin.focus({ preventScroll: true });
      }
    };
  }, [origin]);
  return (
    <dialog
      ref={dialog}
      className="hybrid-proposal-dialog"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h3 id={headingId}>
            Open proposals <span>{items.length}</span>
          </h3>
          <p id={descriptionId}>{title}</p>
        </div>
        <button type="button" aria-label="Close proposals" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="hybrid-proposal-dialog-body">
        <p className="hybrid-count-explanation">
          Each proposal appears once, even when it relates to several topics.
        </p>
        <ul className="hybrid-proposal-results">
          {items.slice(0, visible).map((step) => (
            <li key={step.id}>
              <ProposalLink
                step={step}
                topics={topics}
                demo={demo}
                organizationId={organizationId}
              />
            </li>
          ))}
        </ul>
        {items.length > visible && (
          <button
            className="hybrid-more"
            onClick={() => setVisible((count) => count + 5)}
          >
            Show more proposals <ChevronDown size={18} />
          </button>
        )}
        {demo && (
          <p className="hybrid-count-explanation">
            Illustrative demo connections. No real changes.
          </p>
        )}
      </div>
    </dialog>
  );
}
