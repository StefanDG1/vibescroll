"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm } from "./action-form";
import { saveProject, removeProject } from "@/app/actions";
import { Input, Label, Textarea, Card } from "@companynerve/ui";
import "./work-screens.css";

type Project = { _id: string; name: string; description: string };
const nameLimit = 80;
const descriptionLimit = 2000;

function ProjectFields({ project }: { project?: Project }) {
  const { pending } = useFormStatus();
  const [nameCount, setNameCount] = useState(project?.name.length ?? 0);
  const [descriptionCount, setDescriptionCount] = useState(
    project?.description.length ?? 0,
  );
  return (
    <fieldset className="work-project-fields" disabled={pending}>
      <div>
        <Label htmlFor="name">Project name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={project?.name}
          required
          pattern={"\\s*\\S.*"}
          maxLength={nameLimit}
          aria-describedby="project-name-length"
          onInput={(event) => setNameCount(event.currentTarget.value.length)}
        />
        <small className="work-form-count" id="project-name-length">
          {nameCount} / {nameLimit}
        </small>
      </div>
      <div>
        <Label htmlFor="description">
          Description <small>Optional</small>
        </Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={project?.description}
          maxLength={descriptionLimit}
          rows={5}
          aria-describedby={
            descriptionCount >= 1800 ? "project-description-length" : undefined
          }
          onInput={(event) =>
            setDescriptionCount(event.currentTarget.value.length)
          }
        />
        {descriptionCount >= 1800 && (
          <small className="work-form-count" id="project-description-length">
            {descriptionCount} / {descriptionLimit}
          </small>
        )}
      </div>
    </fieldset>
  );
}

export function ProjectForm({
  organizationId,
  project,
}: {
  organizationId: string;
  project?: Project;
}) {
  return (
    <div className="work-form">
      <Card>
        <ActionForm
          action={saveProject}
          label={project ? "Save project" : "Create project"}
          pendingLabel={project ? "Saving project…" : "Creating project…"}
        >
          <input type="hidden" name="organizationId" value={organizationId} />
          {project && <input type="hidden" name="id" value={project._id} />}
          <ProjectFields project={project} />
        </ActionForm>
      </Card>
      {project && (
        <details className="panel">
          <summary>Delete this project</summary>
          <ActionForm
            action={removeProject}
            label="Delete project"
            pendingLabel="Deleting project…"
            danger
          >
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="id" value={project._id} />
            <Label htmlFor="confirmation">Type DELETE to confirm</Label>
            <Input
              id="confirmation"
              name="confirmation"
              required
              pattern="DELETE"
            />
          </ActionForm>
        </details>
      )}
    </div>
  );
}
