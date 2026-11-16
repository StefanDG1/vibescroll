"use client";

import { useId, useRef, useState, type Ref, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@companynerve/ui";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import {
  ArrowUpRight,
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  FileText,
  FolderGit2,
  GitPullRequest,
  Inbox,
  Link2,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { ProjectMark } from "./project-mark";
import { useInterfaceMotion } from "./motion-preference";
import { notificationSourceId, workDate } from "../lib/work-presentation";
import "./work-screens.css";

const workDestinations = [
  ["projects", "Projects", FolderGit2],
  ["proposals", "Proposals", FileText],
  ["runs", "Tasks", GitPullRequest],
  ["inbox", "Activity", Activity],
  ["improvements", "Improvements", Sparkles],
] as const;

export function isWorkView(view: string) {
  return view === "proposal" || workDestinations.some(([key]) => view === key);
}

export function WorkLoading({ view }: { view: string }) {
  const motion = useInterfaceMotion();
  const label =
    workDestinations.find(([key]) => key === view)?.[1] ?? "Proposal";
  const projects = view === "projects";
  return (
    <section
      className="work-loading"
      aria-busy="true"
      aria-label={`Loading ${label.toLowerCase()}`}
    >
      <SkeletonTheme
        baseColor="var(--line)"
        highlightColor="var(--panel)"
        enableAnimation={motion}
      >
        <div
          className={projects ? "work-project-grid" : "work-records"}
          aria-hidden="true"
        >
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className={
                projects
                  ? "work-project work-project-placeholder"
                  : "work-record"
              }
            >
              <Skeleton width={34} height={34} borderRadius={9} />
              <span className="work-loading-copy">
                <Skeleton width="72%" height={15} />
                <Skeleton width="46%" height={12} />
              </span>
            </div>
          ))}
        </div>
      </SkeletonTheme>
    </section>
  );
}

export function WorkNavigation({
  organizationId,
  active,
  unread = false,
  onNavigate,
}: {
  organizationId: string;
  active: string;
  unread?: boolean;
  onNavigate?: (view: string) => void;
}) {
  return (
    <nav
      className="work-sections work-primary-navigation"
      aria-label="Work sections"
    >
      {workDestinations.map(([key, title, Icon]) => {
        const current =
          active === key || (active === "proposal" && key === "proposals");
        const name =
          key === "improvements"
            ? "Improvements and results"
            : key === "inbox" && unread
              ? "Activity, unread updates"
              : title;
        const content = (
          <>
            <Icon size={16} aria-hidden="true" />
            <span
              className={key === "improvements" ? "work-nav-wide" : undefined}
            >
              {title}
            </span>
            {key === "improvements" && (
              <span className="work-nav-compact">Results</span>
            )}
            {unread && key === "inbox" && (
              <span className="activity-dot" aria-hidden="true" />
            )}
          </>
        );
        return onNavigate ? (
          <button
            type="button"
            key={key}
            aria-label={name}
            aria-current={current ? "page" : undefined}
            onClick={() => onNavigate(key)}
          >
            {content}
          </button>
        ) : (
          <Link
            href={`/app/${organizationId}/${key}`}
            prefetch={false}
            key={key}
            aria-label={name}
            aria-current={current ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

type RecordId = { _id?: string; id?: string };
type Proposal = RecordId & {
  title?: string;
  repositoryId?: string;
  disposition?: string;
  review?: string;
  sourceId?: string;
  updatedAt?: number;
  detail?: {
    currentProblem?: string;
    proposedChange?: string | null;
  };
};
type Repository = RecordId & {
  fullName?: string;
  name?: string;
  enabled?: boolean;
  confirmed?: boolean;
  status?: string;
};
type Project = RecordId & { name: string; description: string };
type Run = RecordId & {
  state?: string;
  proposalId?: string;
  repositoryId?: string;
  prState?: string;
  updatedAt?: number;
  createdAt?: number;
};
type Notification = RecordId & {
  key?: string;
  message?: string;
  read?: boolean;
  createdAt: number;
  postTitle?: string;
};
type Connection = { provider: string; status: string; updatedAt: number };

export const workId = (record: RecordId) => record._id ?? record.id ?? "";

const statusLabels: Record<string, string> = {
  access_lost: "Access lost",
  accepted: "Accepted",
  awaiting_review: "Ready for review",
  canceled: "Canceled",
  closed_unmerged: "Closed without merge",
  completed: "Completed",
  connected: "Connected",
  deferred: "Deferred",
  disconnected: "Disconnected",
  draft: "Draft PR",
  failed: "Failed",
  merged: "Merged",
  open: "Open",
  publishing: "Publishing",
  queued: "Queued",
  rejected: "Rejected",
  reverted: "Reverted",
  running: "Running",
  unreviewed: "Needs review",
};

export function WorkStatus({
  value,
  label,
}: {
  value?: string;
  label?: string;
}) {
  if (!value) return null;
  return (
    <span className="work-status" data-work-status={value}>
      <span aria-hidden="true" />
      {label ?? statusLabels[value] ?? value.replaceAll("_", " ")}
    </span>
  );
}

export function WorkEmpty({
  title,
  description,
  action,
  icon = "inbox",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: "inbox" | "project" | "proposal" | "task" | "outcome";
}) {
  const Icon = {
    inbox: Inbox,
    project: FolderGit2,
    proposal: FileText,
    task: GitPullRequest,
    outcome: Sparkles,
  }[icon];
  return (
    <section className="work-empty">
      <span className="work-empty-icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function WorkFilters<T extends string>({
  label,
  options,
  firstButtonRef,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; count?: number }[];
  firstButtonRef?: Ref<HTMLButtonElement>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="work-filters">
      <legend className="sr-only">{label}</legend>
      {options.map((option, index) => (
        <button
          type="button"
          key={option.value}
          ref={index === 0 ? firstButtonRef : undefined}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </fieldset>
  );
}

function WorkSearch({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <label className="work-search">
      <Search size={17} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ProposalRoute({
  organizationId,
  proposal,
  onOpen,
  children,
  className,
}: {
  organizationId: string;
  proposal: Proposal;
  onOpen?: (id: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const proposalId = workId(proposal);
  if (onOpen)
    return (
      <button
        type="button"
        className={className}
        onClick={() => onOpen(proposalId)}
      >
        {children}
      </button>
    );
  return (
    <Link
      href={`/app/${organizationId}/proposals/${proposalId}`}
      prefetch={false}
      className={className}
    >
      {children}
    </Link>
  );
}

export function WorkProjects({
  organizationId,
  repositories,
  projects: savedProjects = [],
  proposals,
  canCreate = false,
  onOpenProposal,
  onManage,
}: {
  organizationId: string;
  repositories: Repository[];
  projects?: Project[];
  proposals: Proposal[];
  canCreate?: boolean;
  onOpenProposal?: (id: string) => void;
  onManage: () => void;
}) {
  const projects = repositories.filter((repo) => repo.enabled);
  const createLink = canCreate ? (
    <Button asChild variant="outline">
      <Link href={`/app/${organizationId}/projects/new`} prefetch={false}>
        <Plus size={16} aria-hidden="true" /> New project
      </Link>
    </Button>
  ) : null;
  if (!projects.length && !savedProjects.length)
    return (
      <WorkEmpty
        icon="project"
        title="Connect your first project"
        description="Choose a GitHub repository to match insights to the work you do."
        action={
          <div className="work-toolbar-actions">
            <button className="button" type="button" onClick={onManage}>
              Manage repositories
            </button>
            {createLink}
          </div>
        }
      />
    );
  return (
    <section className="work-projects" aria-label="Connected projects">
      <div className="work-toolbar">
        <p>
          {projects.length} selected{" "}
          {projects.length === 1 ? "repository" : "repositories"}
        </p>
        <div className="work-toolbar-actions">
          <button
            className="work-inline-action"
            type="button"
            onClick={onManage}
          >
            <Link2 size={17} aria-hidden="true" /> Manage repositories
          </button>
          {createLink}
        </div>
      </div>
      <div className="work-project-grid">
        {projects.map((repo) => {
          const repoId = workId(repo);
          const linked = proposals.filter(
            (proposal) => proposal.repositoryId === repoId,
          );
          const pending = linked.filter(
            (proposal) => proposal.review === "unreviewed",
          ).length;
          const fullName = repo.fullName ?? repo.name ?? "Repository";
          const slash = fullName.indexOf("/");
          const name = slash < 0 ? fullName : fullName.slice(slash + 1);
          const owner = slash < 0 ? null : fullName.slice(0, slash);
          const connected = !repo.status || repo.status === "connected";
          const identity = (
            <>
              <ProjectMark name={fullName} />
              <div>
                {owner && <p>{owner}</p>}
                <h2>{name}</h2>
              </div>
            </>
          );
          return (
            <article className="work-project" key={repoId}>
              {onOpenProposal ? (
                <div className="work-project-identity">{identity}</div>
              ) : (
                <Link
                  className="work-project-identity"
                  href={`/app/${organizationId}/projects/${repoId}`}
                  prefetch={false}
                  aria-label={fullName}
                >
                  {identity}
                </Link>
              )}
              <WorkStatus
                value={connected && repo.confirmed ? "connected" : "unreviewed"}
                label={
                  connected
                    ? repo.confirmed
                      ? "Context reviewed"
                      : "Review context"
                    : "Check connection"
                }
              />
              {linked.length ? (
                <details className="work-project-proposals">
                  <summary>
                    <FileText size={16} aria-hidden="true" />
                    <span>
                      {linked.length}{" "}
                      {linked.length === 1 ? "proposal" : "proposals"}
                    </span>
                    {pending > 0 && <small>{pending} to review</small>}
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <ul>
                    {linked.map((proposal) => (
                      <li key={workId(proposal)}>
                        <ProposalRoute
                          organizationId={organizationId}
                          proposal={proposal}
                          onOpen={onOpenProposal}
                          className="work-project-proposal"
                        >
                          {proposal.title ?? "Untitled proposal"}
                        </ProposalRoute>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p className="work-project-quiet">No proposals in this list</p>
              )}
            </article>
          );
        })}
      </div>
      {savedProjects.length > 0 && (
        <section className="work-saved-projects" aria-label="Other projects">
          <h2>Other projects</h2>
          <ul className="work-records">
            {savedProjects.map((project) => (
              <li key={workId(project)}>
                <Link
                  href={`/app/${organizationId}/projects/${workId(project)}`}
                  prefetch={false}
                  className="work-record work-record-link"
                >
                  <span className="work-record-icon">
                    <ProjectMark name={project.name} />
                  </span>
                  <span className="work-record-body">
                    <strong>{project.name}</strong>
                    {project.description && (
                      <span className="work-record-description">
                        {project.description}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

type ProposalFilter = "all" | "unreviewed" | "accepted" | "other";
export function WorkProposals({
  organizationId,
  proposals,
  repositories,
  onOpenProposal,
  onOpenPosts,
}: {
  organizationId: string;
  proposals: Proposal[];
  repositories: Repository[];
  onOpenProposal?: (id: string) => void;
  onOpenPosts: () => void;
}) {
  const [filter, setFilter] = useState<ProposalFilter>("all");
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const projectNames = new Map(
    repositories.map((repo) => [workId(repo), repo.fullName ?? repo.name]),
  );
  const classify = (proposal: Proposal) =>
    proposal.review === "unreviewed" || proposal.review === "accepted"
      ? proposal.review
      : "other";
  const query = search.trim().toLowerCase();
  const matches = proposals.filter(
    (proposal) =>
      !query ||
      [
        proposal.title,
        projectNames.get(proposal.repositoryId ?? ""),
        proposal.detail?.currentProblem,
        proposal.detail?.proposedChange,
      ].some((text) => text?.toLowerCase().includes(query)),
  );
  const filtered = matches.filter(
    (item) => filter === "all" || classify(item) === filter,
  );
  if (!proposals.length)
    return (
      <WorkEmpty
        icon="proposal"
        title="No proposals to review"
        description="Open an analyzed post and choose a project to draft a proposal."
        action={
          <button className="button" type="button" onClick={onOpenPosts}>
            Browse saved posts
          </button>
        }
      />
    );
  return (
    <section aria-label="Project proposals">
      <div className="work-toolbar">
        <WorkFilters
          label="Filter proposals"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: matches.length },
            {
              value: "unreviewed",
              label: "Needs review",
              count: matches.filter((item) => classify(item) === "unreviewed")
                .length,
            },
            {
              value: "accepted",
              label: "Accepted",
              count: matches.filter((item) => classify(item) === "accepted")
                .length,
            },
            {
              value: "other",
              label: "Other",
              count: matches.filter((item) => classify(item) === "other")
                .length,
            },
          ]}
        />
        <WorkSearch
          value={search}
          onChange={setSearch}
          placeholder="Search proposals"
          inputRef={searchInput}
        />
      </div>
      <output className="sr-only">
        {filtered.length} {filtered.length === 1 ? "proposal" : "proposals"}
      </output>
      {filtered.length ? (
        <ul className="work-records">
          {filtered.map((proposal) => {
            const project = projectNames.get(proposal.repositoryId ?? "");
            const updated = workDate(proposal.updatedAt);
            return (
              <li key={workId(proposal)}>
                <ProposalRoute
                  organizationId={organizationId}
                  proposal={proposal}
                  onOpen={onOpenProposal}
                  className="work-record work-record-link"
                >
                  <span className="work-record-icon">
                    {project ? (
                      <ProjectMark name={project} />
                    ) : (
                      <FileText size={19} aria-hidden="true" />
                    )}
                  </span>
                  <span className="work-record-body">
                    {project && <small>{project}</small>}
                    <strong>{proposal.title ?? "Untitled proposal"}</strong>
                    {(proposal.detail?.proposedChange ||
                      proposal.detail?.currentProblem) && (
                      <span className="work-record-description">
                        {proposal.detail.proposedChange ||
                          proposal.detail.currentProblem}
                      </span>
                    )}
                    {updated && (
                      <span className="work-record-date">{updated}</span>
                    )}
                  </span>
                  <span className="work-record-end">
                    <WorkStatus value={proposal.review} />
                  </span>
                </ProposalRoute>
              </li>
            );
          })}
        </ul>
      ) : (
        <WorkEmpty
          icon="proposal"
          title="No matching proposals"
          description="Clear the search and filters to see your proposal list."
          action={
            <button
              className="button"
              type="button"
              onClick={() => {
                setFilter("all");
                setSearch("");
                searchInput.current?.focus();
              }}
            >
              Clear filters
            </button>
          }
        />
      )}
    </section>
  );
}

type TaskFilter = "all" | "active" | "attention" | "finished";
type TaskCategory = Exclude<TaskFilter, "all">;
function taskCategory(run: Run): TaskCategory {
  if (
    run.state === "failed" ||
    run.state === "awaiting_review" ||
    run.prState === "access_lost"
  )
    return "attention";
  return run.state === "completed" || run.state === "canceled"
    ? "finished"
    : "active";
}

export function WorkTasks({
  runs,
  render,
  onOpenProposals,
}: {
  runs: Run[];
  render: (run: Run) => ReactNode;
  onOpenProposals: () => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const allButton = useRef<HTMLButtonElement>(null);
  if (!runs.length)
    return (
      <WorkEmpty
        icon="task"
        title="No tasks yet"
        description="An approved execution appears here with its checks and pull request."
        action={
          <button className="button" type="button" onClick={onOpenProposals}>
            Go to proposals
          </button>
        }
      />
    );
  const sorted = [...runs].sort(
    (a, b) =>
      (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
  );
  const filtered = sorted.filter(
    (run) => filter === "all" || taskCategory(run) === filter,
  );
  return (
    <section aria-label="Task history">
      <div className="work-toolbar">
        <WorkFilters
          label="Filter tasks"
          value={filter}
          firstButtonRef={allButton}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: runs.length },
            {
              value: "active",
              label: "In progress",
              count: runs.filter((run) => taskCategory(run) === "active")
                .length,
            },
            {
              value: "attention",
              label: "Needs attention",
              count: runs.filter((run) => taskCategory(run) === "attention")
                .length,
            },
            {
              value: "finished",
              label: "Finished",
              count: runs.filter((run) => taskCategory(run) === "finished")
                .length,
            },
          ]}
        />
      </div>
      <output className="sr-only">
        {filtered.length} {filtered.length === 1 ? "task" : "tasks"}
      </output>
      {filtered.length ? (
        <div className="work-task-list">{filtered.map(render)}</div>
      ) : (
        <WorkEmpty
          icon="task"
          title={
            filter === "attention"
              ? "Nothing needs attention"
              : "No tasks in this view"
          }
          description="Choose All to see your complete task history."
          action={
            <button
              className="button"
              type="button"
              onClick={() => {
                setFilter("all");
                allButton.current?.focus();
              }}
            >
              Show all tasks
            </button>
          }
        />
      )}
    </section>
  );
}

type ActivityFilter = "all" | "unread" | "proposals" | "connections";
type ActivityGroup = {
  notification: Notification;
  count: number;
  source?: string;
};

function groupedActivity(input: Notification[]) {
  const days = new Map<string, ActivityGroup[]>();
  for (const notification of [...input].sort(
    (a, b) => b.createdAt - a.createdAt,
  )) {
    const date = workDate(notification.createdAt);
    if (!date) continue;
    const source = notificationSourceId(notification.key);
    const groups = days.get(date) ?? [];
    const previous = groups.at(-1);
    if (
      previous &&
      previous.source === source &&
      previous.notification.message === notification.message &&
      previous.notification.read === notification.read
    ) {
      previous.count++;
    } else {
      groups.push({ notification, source, count: 1 });
    }
    days.set(date, groups);
  }
  return days;
}

export function WorkActivity({
  organizationId,
  notifications,
  proposals,
  connections,
  onOpenProposal,
  onConnections,
  onProposals,
  settings,
}: {
  organizationId: string;
  notifications: Notification[];
  proposals: Proposal[];
  connections?: Connection[];
  onOpenProposal?: (id: string) => void;
  onConnections: () => void;
  onProposals: () => void;
  settings: ReactNode;
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const dateListId = useId();
  const pending = proposals.filter(
    (proposal) => proposal.review === "unreviewed",
  );
  const unread = notifications.filter((notification) => !notification.read);
  const activity = filter === "unread" ? unread : notifications;
  const days = groupedActivity(activity);
  const visibleCount =
    filter === "proposals"
      ? pending.length
      : filter === "connections"
        ? (connections?.length ?? 0)
        : activity.length;
  return (
    <section aria-label="Workspace activity">
      <div className="work-toolbar">
        <WorkFilters
          label="Filter activity"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: unread.length },
            { value: "proposals", label: "Proposals", count: pending.length },
            { value: "connections", label: "Integrations" },
          ]}
        />
      </div>
      <output className="sr-only">
        {visibleCount} {visibleCount === 1 ? "result" : "results"}
      </output>
      {filter === "proposals" ? (
        pending.length ? (
          <ul className="work-records" aria-label="Proposals to review">
            {pending.map((proposal) => (
              <li key={workId(proposal)}>
                <ProposalRoute
                  organizationId={organizationId}
                  proposal={proposal}
                  onOpen={onOpenProposal}
                  className="work-record work-record-link"
                >
                  <span className="work-record-icon">
                    <FileText size={19} aria-hidden="true" />
                  </span>
                  <span className="work-record-body">
                    <strong>{proposal.title}</strong>
                    <span className="work-record-date">
                      {workDate(proposal.updatedAt)}
                    </span>
                  </span>
                  <span className="work-record-end">
                    <WorkStatus value="unreviewed" />
                  </span>
                </ProposalRoute>
              </li>
            ))}
          </ul>
        ) : (
          <WorkEmpty
            title="No proposals waiting for review"
            description="Previously reviewed proposals are still available in Work."
            action={
              <button className="button" type="button" onClick={onProposals}>
                See proposals
              </button>
            }
          />
        )
      ) : filter === "connections" ? (
        connections?.length ? (
          <ul className="work-records" aria-label="Integrations">
            {connections.map((connection) => (
              <li key={connection.provider}>
                <button
                  className="work-record work-record-link"
                  type="button"
                  onClick={onConnections}
                >
                  <span className="work-record-icon">
                    <Link2 size={19} aria-hidden="true" />
                  </span>
                  <span className="work-record-body">
                    <strong>
                      {connection.provider === "github"
                        ? "GitHub"
                        : connection.provider.replaceAll("_", " ")}
                    </strong>
                    <span className="work-record-date">
                      {workDate(connection.updatedAt)}
                    </span>
                  </span>
                  <span className="work-record-end">
                    <WorkStatus value={connection.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <WorkEmpty
            title="No integration updates"
            description="Manage GitHub and assistant access in Connections."
            action={
              <button className="button" type="button" onClick={onConnections}>
                View connections
              </button>
            }
          />
        )
      ) : days.size ? (
        <div className="work-activity-days">
          {[...days].map(([date, groups], index) => (
            <section key={date} aria-labelledby={`${dateListId}-${index}`}>
              <h2 id={`${dateListId}-${index}`}>{date}</h2>
              <ul className="work-records">
                {groups.map(({ notification, source, count }) => {
                  const Icon = source
                    ? FileText
                    : notification.key?.startsWith("assistant:")
                      ? MessageSquare
                      : Bell;
                  return (
                    <li className="work-record" key={workId(notification)}>
                      <span className="work-record-icon">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <div className="work-record-body">
                        {source && notification.postTitle && (
                          <Link
                            href={`/app/${organizationId}/posts/${source}`}
                            prefetch={false}
                            className="work-inline-action work-activity-title"
                          >
                            {notification.postTitle}
                          </Link>
                        )}
                        <p>{notification.message ?? "Workspace update"}</p>
                        {count > 1 && (
                          <span className="work-record-date">
                            {count} matching notifications
                          </span>
                        )}
                        {source && !notification.postTitle && (
                          <Link
                            href={`/app/${organizationId}/posts/${source}`}
                            prefetch={false}
                            className="work-inline-action"
                          >
                            Open post
                          </Link>
                        )}
                      </div>
                      {!notification.read && (
                        <span className="work-unread">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <WorkEmpty
          title={filter === "unread" ? "You're caught up" : "No activity yet"}
          description={
            filter === "unread"
              ? "There are no unread workspace updates."
              : "Updates about saved posts and proposals will appear here."
          }
        />
      )}
      {settings}
    </section>
  );
}

export function RecordedWorkOutcomes({
  runs,
  repositories,
  proposals,
}: {
  runs: (Run & {
    prUrl?: string;
    prNumber?: number;
    mergedAt?: string;
    reverted?: { url: string; observedAt?: number };
  })[];
  repositories: Repository[];
  proposals: Proposal[];
}) {
  const [filter, setFilter] = useState<"all" | "merged" | "reverted">("all");
  const allResults = useRef<HTMLButtonElement>(null);
  const observed = runs.filter(
    (run) => run.prUrl && (run.mergedAt || run.reverted),
  );
  const merged = observed.filter((run) => !run.reverted);
  const reverted = observed.filter((run) => run.reverted);
  const visible =
    filter === "merged" ? merged : filter === "reverted" ? reverted : observed;
  const observedTime = (run: (typeof observed)[number]) =>
    run.reverted?.observedAt ??
    (Date.parse(run.mergedAt ?? "") || run.updatedAt || 0);
  const ordered = [...visible].sort(
    (a, b) => observedTime(b) - observedTime(a),
  );
  const projectsById = new Map(
    repositories.map((repo) => [workId(repo), repo]),
  );
  const proposalsById = new Map(
    proposals.map((proposal) => [workId(proposal), proposal]),
  );
  return (
    <section aria-label="Recorded outcomes">
      {observed.length > 0 && (
        <div className="work-toolbar">
          <WorkFilters
            label="Filter outcomes"
            value={filter}
            onChange={setFilter}
            firstButtonRef={allResults}
            options={[
              { value: "all", label: "All outcomes", count: observed.length },
              { value: "merged", label: "Merged", count: merged.length },
              { value: "reverted", label: "Reverted", count: reverted.length },
            ]}
          />
        </div>
      )}
      <output className="sr-only">
        {visible.length} recorded{" "}
        {visible.length === 1 ? "outcome" : "outcomes"}
      </output>
      {ordered.length ? (
        <ul className="work-records">
          {ordered.map((run) => {
            const project = projectsById.get(run.repositoryId ?? "");
            const proposal = proposalsById.get(run.proposalId ?? "");
            const recorded = workDate(
              run.reverted?.observedAt ?? run.mergedAt ?? run.updatedAt,
            );
            const Icon = run.reverted ? RotateCcw : CheckCircle2;
            return (
              <li className="work-record" key={workId(run)}>
                <span className="work-record-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <div className="work-record-body">
                  {project && <small>{project.fullName ?? project.name}</small>}
                  <strong>
                    {proposal?.title ??
                      (run.prNumber
                        ? `Pull request #${run.prNumber}`
                        : "Pull request")}
                  </strong>
                  {recorded && (
                    <span className="work-record-date">{recorded}</span>
                  )}
                  <div className="work-outcome-links">
                    <a
                      className="work-inline-action"
                      href={run.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {run.reverted ? "Original PR" : "Open on GitHub"}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                    {run.reverted && (
                      <a
                        className="work-inline-action"
                        href={run.reverted.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Verified reversal{" "}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
                <WorkStatus
                  value={run.reverted ? "reverted" : "merged"}
                  label={run.reverted ? "Reverted" : "Merged"}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <WorkEmpty
          icon="outcome"
          title={
            observed.length ? "No matching outcomes" : "No outcomes recorded"
          }
          description="Merged and reverted changes appear when GitHub has confirmed them."
          action={
            observed.length > 0 && (
              <button
                className="button"
                type="button"
                onClick={() => {
                  setFilter("all");
                  allResults.current?.focus();
                }}
              >
                Show all outcomes
              </button>
            )
          }
        />
      )}
    </section>
  );
}
