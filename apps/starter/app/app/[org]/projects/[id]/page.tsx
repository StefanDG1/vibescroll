import { backend, api } from "@/lib/backend";
import { ProjectForm } from "@/components/project-form";
import { WorkspaceSubpage } from "@/components/workspace-subpage";
import { ProjectMark } from "@/components/project-mark";
import {
  WorkEmpty,
  WorkNavigation,
  WorkStatus,
} from "@/components/work-screens";
import { workDate } from "@/lib/work-presentation";
import { ExternalLink, FileText, GitBranch } from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
export default async function Page({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const c = await backend(),
    organizationId = org as Id<"organizations">;
  const [repositories, info] = await Promise.all([
    c.query(api.product.repositories, { organizationId }),
    c.query(api.organizations.details, { organizationId }),
  ]);
  const repository = repositories.find((row) => row._id === id);
  if (repository) {
    const proposals = (
      await c.query(api.product.proposals, { organizationId })
    ).filter((row) => row.repositoryId === repository._id);
    const [owner, name] = repository.fullName.split("/");
    const pending = repository.status !== "connected" || !repository.confirmed;
    const updated = workDate(repository.updatedAt);
    const context = repository.confirmed
      ? repository.profile
      : repository.profileDraft;
    return (
      <WorkspaceSubpage org={org} title={name || owner} backTo="projects">
        <WorkNavigation organizationId={org} active="projects" />
        <div className="work-detail project-detail">
          <section className="work-detail-card" aria-label="Repository">
            <div className="work-project-identity">
              <ProjectMark name={repository.fullName} />
              <div>
                <h2>{repository.fullName}</h2>
                {updated && <p>Updated {updated}</p>}
              </div>
            </div>
            <div className="work-detail-meta">
              <WorkStatus
                value={pending ? "unreviewed" : "connected"}
                label={
                  repository.status === "connected"
                    ? pending
                      ? "Review context"
                      : "Context reviewed"
                    : "Check connection"
                }
              />
              {repository.branch && (
                <span>
                  <GitBranch size={15} aria-hidden="true" /> {repository.branch}
                </span>
              )}
            </div>
            <div className="work-toolbar-actions">
              <Link
                className="button"
                href={`/app/${org}/projects#repository-${repository._id}`}
                prefetch={false}
              >
                Manage repository
              </Link>
              {owner && name && (
                <a
                  className="work-inline-action"
                  href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open on GitHub <ExternalLink size={15} aria-hidden="true" />
                </a>
              )}
            </div>
          </section>
          {proposals.length ? (
            <section aria-label="Project proposals">
              <h2 className="work-detail-heading">Proposals</h2>
              <ul className="work-records">
                {proposals.map((proposal) => (
                  <li key={proposal._id}>
                    <Link
                      className="work-record work-record-link"
                      href={`/app/${org}/proposals/${proposal._id}`}
                      prefetch={false}
                    >
                      <span className="work-record-icon">
                        <FileText size={17} aria-hidden="true" />
                      </span>
                      <span className="work-record-body">
                        <strong>{proposal.title}</strong>
                        <small>{workDate(proposal.updatedAt)}</small>
                      </span>
                      <span className="work-record-end">
                        <WorkStatus value={proposal.review} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <WorkEmpty
              icon="proposal"
              title="No proposals in this list"
              description="Choose this project from an analyzed post to draft a proposal."
              action={
                <Link className="button" href={`/app/${org}/posts`}>
                  Browse saved posts
                </Link>
              }
            />
          )}
          <section className="work-detail-card project-context">
            <h2 className="work-detail-heading">Project context</h2>
            {context ? (
              <details>
                <summary>
                  Read{" "}
                  {repository.confirmed ? "reviewed context" : "context draft"}
                </summary>
                <p>{context}</p>
              </details>
            ) : (
              <p>
                Review this repository’s context before using its project
                recommendations.
              </p>
            )}
          </section>
        </div>
      </WorkspaceSubpage>
    );
  }
  const p = await c.query(api.projects.get, {
    organizationId,
    id: id as Id<"projects">,
  });
  return (
    <WorkspaceSubpage org={org} title={p.name} backTo="projects">
      <WorkNavigation organizationId={org} active="projects" />
      {["member", "viewer"].includes(info.role) ? (
        <p className="work-project-description">
          {p.description || "No description yet."}
        </p>
      ) : (
        <ProjectForm organizationId={org} project={p} />
      )}
    </WorkspaceSubpage>
  );
}
