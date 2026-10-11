export function ProposalBubble({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span
      className="hybrid-proposal-bubble"
      aria-label={`${count} open ${count === 1 ? "proposal" : "proposals"}`}
    >
      {count}
    </span>
  );
}
export function ProposalBubbleButton({
  count,
  name,
  onClick,
}: {
  count?: number;
  name: string;
  onClick?: () => void;
}) {
  if (!count || !onClick) return null;
  return (
    <button
      type="button"
      className="hybrid-bubble-button"
      aria-label={`View ${count} open ${count === 1 ? "proposal" : "proposals"} for ${name}`}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <ProposalBubble count={count} />
    </button>
  );
}
