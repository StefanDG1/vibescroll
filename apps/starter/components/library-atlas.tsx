"use client";
import { useEffect, useState } from "react";
import {
  Search,
  Network,
  Folder,
  ChevronDown,
  ChevronRight,
  Compass,
  ListChecks,
  Lightbulb,
  Code,
  ChartNoAxesCombined,
  Megaphone,
  UsersRound,
  Palette,
  Shield,
  Workflow,
  BookOpen,
  Heart,
  Wrench,
  FileText,
  SlidersHorizontal,
  CircleHelp,
} from "lucide-react";
import { motion } from "motion/react";
import { Button, Tooltip } from "@companynerve/ui";
import { LibrarySkeleton } from "./library-skeleton";
import { TopicLoader } from "./topic-loader";
import { ProposalBubbleButton } from "./proposal-bubble";
import { ProposalLink } from "./proposal-link";
import { ProposalDrilldown } from "./proposal-drilldown";
import {
  proposalBadgeTotals,
  proposalDrilldown,
  type ProposalSelection,
  openReferenceProposals,
  badgeReferenceKey,
  type ProposalBadgePage,
} from "../../../packages/knowledge/proposal-badges";
import { TopicDiagram } from "./topic-diagram";
import { titleCase } from "@/lib/title-case";
import { topicPath } from "@/lib/topic-tree";
import { insightPresentation } from "../../../packages/insights/presentation";
import type { LibraryPlace } from "@/lib/library-place";
import { useInterfaceMotion } from "./motion-preference";
const insightIcons = {
  compass: Compass,
  checklist: ListChecks,
  lightbulb: Lightbulb,
  code: Code,
  chart: ChartNoAxesCombined,
  megaphone: Megaphone,
  users: UsersRound,
  palette: Palette,
  shield: Shield,
  workflow: Workflow,
  book: BookOpen,
  heart: Heart,
  wrench: Wrench,
};
function HelpNote({
  children,
  label = "About these connections",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="hybrid-help-trigger"
            aria-label={label}
            onClick={(event) => {
              event.preventDefault();
              setOpen(!open);
            }}
          >
            <CircleHelp size={16} aria-hidden="true" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="hybrid-help-tooltip"
            side="top"
            align="end"
            sideOffset={6}
            collisionPadding={16}
          >
            {children}
            <Tooltip.Arrow className="hybrid-help-tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
const emptyMembers: any[] = [];
function EvidenceList({
  detail,
  organizationId,
  demo,
  badges,
  onMoreEvidence,
  loadingEvidence,
  place,
  onRemember,
  onOpenProposals,
}: {
  onOpenProposals: (
    selection: ProposalSelection,
    title: string,
    origin: HTMLButtonElement,
  ) => void;
  detail: any;
  organizationId: string;
  demo: boolean;
  badges: ProposalBadgePage | null;
  onMoreEvidence: () => void;
  loadingEvidence: boolean;
  place?: LibraryPlace | null;
  onRemember: (patch: Partial<LibraryPlace>) => void;
}) {
  const members = detail?.members ?? emptyMembers;
  const [visible, setVisible] = useState(() =>
      Math.max(
        5,
        members.findIndex((m: any) => m._id === place?.insightId) + 1,
      ),
    ),
    [insightId, setInsightId] = useState<string | null>(() =>
      members.some((m: any) => m._id === place?.insightId)
        ? place!.insightId!
        : null,
    );
  const [pointer, setPointer] = useState(false),
    animate = useInterfaceMotion();
  const totals = proposalBadgeTotals(badges);
  return (
    <div className="hybrid-evidence" data-evidence-topic={detail?.topic?.name}>
      {!detail ? (
        <LibrarySkeleton />
      ) : (
        <div className="hybrid-insight-tray">
          <div className="hybrid-evidence-heading">
            <span>{titleCase(detail.topic?.name ?? "Insights")}</span>
            <small>Insights</small>
          </div>
          <ul>
            {members.slice(0, visible).map((member: any) => {
              const presentation = insightPresentation(member.evidence.insight),
                label = titleCase(presentation.title),
                Icon = insightIcons[presentation.icon],
                expanded = member._id === insightId,
                steps = openReferenceProposals(
                  badges,
                  member.evidence.reference,
                ),
                count =
                  totals?.references[
                    badgeReferenceKey(member.evidence.reference)
                  ];
              const proposalHelp = badges && !totals && (
                <HelpNote label="About proposal coverage">
                  {badges.next
                    ? "Proposal totals appear after all current permitted pages are checked. Continue browsing to load more."
                    : "This bounded check could not establish the total. Review proposals in Projects."}{" "}
                  Closed proposals remain in Projects.
                </HelpNote>
              );
              return (
                <li key={member._id} data-selected={expanded}>
                  <div className="hybrid-insight-card-control">
                    <button
                      className="hybrid-insight-select"
                      aria-label={`Inspect ${member.evidence.insight.claim}${count ? `, ${count} open proposals` : ""}`}
                      aria-expanded={expanded}
                      data-has-bubble={!!count}
                      onPointerDown={() => setPointer(true)}
                      onKeyDown={() => setPointer(false)}
                      onClick={(event) => {
                        setPointer(event.detail > 0);
                        const next = expanded ? null : member._id;
                        setInsightId(next);
                        onRemember({ insightId: next ?? undefined });
                      }}
                    >
                      <span
                        className="hybrid-insight-icon"
                        data-icon={presentation.icon}
                        data-tone={
                          Object.keys(insightIcons).indexOf(presentation.icon) %
                          4
                        }
                      >
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="hybrid-insight-copy">
                        <strong title={label}>{label}</strong>
                        <small>
                          <FileText size={14} aria-hidden="true" />
                          <span
                            className="hybrid-source-label"
                            title={member.evidence.title}
                          >
                            {demo
                              ? member.evidence.title.replace(
                                  "Synthetic example",
                                  "Example",
                                )
                              : member.evidence.title}
                          </span>
                        </small>
                      </span>
                      {!!count && (
                        <span
                          className="hybrid-proposal-slot"
                          aria-hidden="true"
                        />
                      )}
                      {expanded ? (
                        <ChevronDown size={18} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={18} aria-hidden="true" />
                      )}
                    </button>
                    <ProposalBubbleButton
                      count={count}
                      name={label}
                      onClick={(origin) =>
                        onOpenProposals(
                          { reference: member.evidence.reference },
                          label,
                          origin,
                        )
                      }
                    />
                  </div>
                  <motion.div
                    className="hybrid-insight-details"
                    initial={false}
                    animate={{
                      height: expanded ? "auto" : 0,
                      opacity: expanded ? 1 : 0,
                    }}
                    transition={{
                      duration: animate && pointer ? 0.2 : 0,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    inert={!expanded}
                    aria-hidden={!expanded || undefined}
                  >
                    <div>
                      <h3>{member.evidence.title}</h3>
                      <p>{member.evidence.insight.claim}</p>
                      <Button
                        asChild
                        variant="outline"
                        className="hybrid-source-button"
                      >
                        <a
                          href={
                            demo
                              ? `/demo?view=library&source=${encodeURIComponent(member.evidence.reference.sourceId)}`
                              : `/app/${organizationId}/library?source=${encodeURIComponent(member.evidence.reference.sourceId)}`
                          }
                        >
                          <FileText size={17} aria-hidden="true" />
                          View source evidence
                          <ChevronRight size={16} aria-hidden="true" />
                        </a>
                      </Button>
                      {expanded && !badges && (
                        <LibrarySkeleton kind="proposals" rows={2} />
                      )}
                      {expanded && steps.length > 0 && (
                        <div className="hybrid-proposals">
                          <div className="hybrid-proposal-status">
                            <span>Open proposals</span>
                            {proposalHelp}
                          </div>
                          {steps.map((step: any) => (
                            <ProposalLink
                              key={step.id}
                              step={step}
                              demo={demo}
                              organizationId={organizationId}
                            />
                          ))}
                          {demo && (
                            <small>
                              Illustrative demo connections. No real changes.
                            </small>
                          )}
                        </div>
                      )}
                      {expanded && badges && !steps.length && (
                        <div className="hybrid-proposal-status hybrid-proposal-empty">
                          <p>
                            {totals
                              ? "No open proposals for this insight."
                              : "No open proposals in the checked pages yet."}
                          </p>
                          {proposalHelp}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </li>
              );
            })}
          </ul>
          {members.length > visible ? (
            <button
              className="hybrid-more"
              onClick={() => setVisible((n) => n + 5)}
            >
              More insights <ChevronDown size={18} />
            </button>
          ) : detail.next ? (
            <button
              className="hybrid-more"
              disabled={loadingEvidence}
              onClick={() => {
                setVisible((n) => n + 5);
                onMoreEvidence();
              }}
            >
              {loadingEvidence ? "Loading insights..." : "More insights"}{" "}
              <ChevronDown size={18} />
            </button>
          ) : null}
          {!members.length && (
            <p>No current permitted evidence in this page.</p>
          )}
        </div>
      )}
    </div>
  );
}
export function LibraryAtlas({
  topics,
  selected,
  detail,
  search,
  onSearch,
  folders,
  onFolders,
  onOpen,
  onMoreTopics,
  onMoreEvidence,
  loading,
  loadingEvidence,
  message,
  onRetry,
  organizationId,
  demo,
  badges,
  advanced,
  corrections,
  place,
  onRemember,
}: {
  topics: any;
  selected: any;
  detail: any;
  search: string;
  onSearch: (s: string) => void;
  folders: boolean;
  onFolders: (value: boolean) => void;
  onOpen: (topic: any) => void;
  onMoreTopics: () => void;
  onMoreEvidence: () => void;
  loading: boolean;
  loadingEvidence: boolean;
  message: string;
  onRetry: () => void;
  organizationId: string;
  demo: boolean;
  badges: ProposalBadgePage | null;
  advanced: React.ReactNode;
  corrections: React.ReactNode;
  place?: LibraryPlace | null;
  onRemember: (patch: Partial<LibraryPlace>) => void;
  animateEntry?: boolean;
}) {
  const items = topics?.items ?? [];
  const defaultFiling = items.some(
    (t: any) => !t.parentId && t.autoCategory && t.name === "Business",
  )
    ? "Business"
    : items.some(
          (t: any) => !t.parentId && t.autoCategory && t.name === "Personal",
        )
      ? "Personal"
      : "Business";
  const startingRoot = items.find(
    (topic: any) => topic.id === topicPath(items, selected?.id ?? "")[0]?.id,
  )?.name;
  const [filing, setFiling] = useState<"Personal" | "Business">(
    place?.filing ?? (startingRoot === "Personal" ? "Personal" : defaultFiling),
  );
  useEffect(() => {
    const next =
      place?.filing ??
      (startingRoot === "Personal" || startingRoot === "Business"
        ? startingRoot
        : undefined);
    // oxlint-disable-next-line react/set-state-in-effect -- Restore the authorized branch's filing when external navigation loads.
    if (next) setFiling(next);
  }, [startingRoot, place?.filing, defaultFiling]);
  const [proposalSelection, setProposalSelection] = useState<{
    selection: ProposalSelection;
    title: string;
    scope: string;
    origin: HTMLElement | null;
  } | null>(null);
  const authority = JSON.stringify([
    organizationId,
    topics?.scope,
    badges?.scope,
    search,
  ]);
  const currentSelection = proposalSelection?.selection;
  const selectionAvailable =
    currentSelection &&
    ("topicId" in currentSelection
      ? items.some((topic: any) => topic.id === currentSelection.topicId)
      : detail?.members?.some(
          (member: any) =>
            badgeReferenceKey(member.evidence.reference) ===
            badgeReferenceKey(currentSelection.reference),
        ));
  const proposalItems =
    proposalSelection?.scope === authority && !message && selectionAvailable
      ? proposalDrilldown(badges, proposalSelection.selection)
      : null;
  function showProposals(
    selection: ProposalSelection,
    title: string,
    origin: HTMLButtonElement,
  ) {
    setProposalSelection({
      selection,
      title,
      scope: authority,
      origin,
    });
  }
  // Never retain a proposal sheet through an invalidated or incomplete permission proof.
  useEffect(() => {
    if (proposalSelection && (!proposalItems || !proposalItems.length)) {
      // oxlint-disable-next-line react/set-state-in-effect -- Clear the selection when its external permission proof is invalidated.
      setProposalSelection(null);
    }
  }, [proposalSelection, proposalItems]);
  const evidenceKey = `${selected?.id}:${detail?.resetKey ?? "opening"}`;
  function chooseFiling(value: "Personal" | "Business") {
    setFiling(value);
    const root = items.find(
      (topic: any) =>
        !topic.parentId && topic.autoCategory && topic.name === value,
    );
    onRemember({
      filing: value,
      closedTopicId: undefined,
      insightId: undefined,
    });
    if (root) onOpen(root);
  }
  return (
    <section
      className={`hybrid-library ${folders ? "hybrid-folders" : "hybrid-tree"}`}
      aria-label="Library atlas"
      aria-busy={loading || loadingEvidence}
    >
      <div className="hybrid-heading-row">
        <div className="hybrid-title">
          <h2>Library</h2>
          <HelpNote label="How proposal counts work">
            A proposal can relate to several topics. Each total counts it once.
            Tap a number to see its open proposals. Closed proposals remain in
            Projects.
          </HelpNote>
        </div>
        <label className="hybrid-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search library</span>
          <input
            value={search}
            placeholder="Search library..."
            maxLength={120}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="hybrid-toolbar">
        <div className="hybrid-switch" aria-label="Library representation">
          <button aria-pressed={!folders} onClick={() => onFolders(false)}>
            <Network size={17} />
            Tree
          </button>
          <button aria-pressed={folders} onClick={() => onFolders(true)}>
            <Folder size={17} />
            Folders
          </button>
        </div>
        <div className="hybrid-switch" aria-label="Personal or business filing">
          <button
            aria-pressed={filing === "Personal"}
            onClick={() => chooseFiling("Personal")}
          >
            Personal
          </button>
          <button
            aria-pressed={filing === "Business"}
            onClick={() => chooseFiling("Business")}
          >
            Business
          </button>
        </div>
      </div>
      {loading && !items.length && <LibrarySkeleton kind="topics" rows={3} />}
      {message && (
        <div>
          <p role="alert">{message}</p>
          <button onClick={onRetry} disabled={loading}>
            Retry loading library
          </button>
        </div>
      )}
      {!loading && !message && !items.length && (
        <p>No current insights here. Try another topic or library view.</p>
      )}
      <TopicDiagram
        topics={items}
        proposalCounts={proposalBadgeTotals(badges)?.topics}
        onOpenProposals={(topic, origin) =>
          showProposals({ topicId: topic.id }, titleCase(topic.name), origin)
        }
        onOpen={onOpen}
        selectedId={selected?.id}
        representation={folders ? "folders" : "tree"}
        filing={filing}
        closedTopicId={place?.closedTopicId}
        onCollapse={(topicId) =>
          onRemember({
            closedTopicId: topicId,
            ...(topicId ? { topicId } : {}),
            insightId: undefined,
          })
        }
      >
        {selected && !selected.autoCategory && (
          <EvidenceList
            key={evidenceKey}
            onOpenProposals={showProposals}
            detail={detail}
            organizationId={organizationId}
            demo={demo}
            badges={badges}
            onMoreEvidence={onMoreEvidence}
            loadingEvidence={loadingEvidence}
            place={place}
            onRemember={onRemember}
          />
        )}
      </TopicDiagram>
      {(topics?.next || badges?.next) && (
        <TopicLoader
          key={`${organizationId}:${topics.scope}:${search}`}
          cursor={JSON.stringify([topics?.next, badges?.next])}
          loading={loading}
          onMore={onMoreTopics}
        />
      )}
      {proposalSelection && proposalItems && proposalItems.length > 0 && (
        <ProposalDrilldown
          key={JSON.stringify([authority, proposalSelection.selection])}
          title={proposalSelection.title}
          items={proposalItems}
          topics={items}
          demo={demo}
          organizationId={organizationId}
          origin={proposalSelection.origin}
          onClose={() => setProposalSelection(null)}
        />
      )}
      <details className="hybrid-settings">
        <summary>
          <SlidersHorizontal size={17} />
          Library options
        </summary>
        {corrections}
        {advanced}
        <p>{topics?.coverage}</p>
      </details>
    </section>
  );
}
