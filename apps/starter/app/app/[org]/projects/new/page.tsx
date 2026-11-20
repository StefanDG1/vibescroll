import { ProjectForm } from "@/components/project-form";
import { WorkspaceSubpage } from "@/components/workspace-subpage";
import { WorkNavigation } from "@/components/work-screens";
export default async function Page({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  return (
    <WorkspaceSubpage org={org} title="New project" backTo="projects">
      <WorkNavigation organizationId={org} active="projects" />
      <ProjectForm organizationId={org} />
    </WorkspaceSubpage>
  );
}
