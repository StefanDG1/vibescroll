"use client";
import Link from "next/link";
import { useId } from "react";

export type TaskRuntime = "work_cloud" | "cloud" | "local";

// These are presentation choices. Availability comes from the existing route
// checks; choosing one never starts work or grants processing authority.
export function TaskRuntimePicker({
  value,
  onChange,
  organizationId,
  serverAvailable = false,
  workCloudAvailable = false,
  workCloudConfigured = false,
  localAvailable = false,
  localConfigured = false,
  localStatus = "setup_required",
  disabled = false,
}: {
  value?: TaskRuntime;
  onChange: (runtime: TaskRuntime) => void;
  organizationId: string;
  serverAvailable?: boolean;
  workCloudAvailable?: boolean;
  workCloudConfigured?: boolean;
  localAvailable?: boolean;
  localConfigured?: boolean;
  localStatus?: "setup_required" | "offline" | "check_before_running";
  disabled?: boolean;
}) {
  const name = useId();
  const options = [
    {
      id: "work_cloud" as const,
      title: "My own Cloud Work",
      description: "Uses your ChatGPT subscription. Your computer can be off.",
      available: workCloudAvailable,
      configured: workCloudConfigured,
      status: workCloudAvailable
        ? "Ready to send to ChatGPT"
        : workCloudConfigured
          ? "Check ChatGPT setup"
          : "Not available yet",
      href: `/app/${organizationId}/connections`,
      detail:
        "Recommended once automatic analysis is verified. Connect VibeScroll in ChatGPT Work with Cloud selected. A connected account alone does not mean automatic video analysis is ready. Your ChatGPT plan limits apply.",
    },
    {
      id: "cloud" as const,
      title: "VibeScroll's servers",
      description: "Runs online using credits bought separately.",
      available: serverAvailable,
      configured: serverAvailable,
      status: serverAvailable ? "Available" : "Not available yet",
      href: `/app/${organizationId}/usage`,
      detail:
        "Uses VibeScroll processing credits, separately from your ChatGPT subscription. Review the credit maximum before starting. An unavailable route cannot be enabled by buying credits.",
    },
    {
      id: "local" as const,
      title: "Local machine",
      description: "Uses your own subscription on your computer. Keep it on.",
      available: localAvailable,
      configured: localConfigured,
      status: !localAvailable
        ? "Not available yet"
        : localStatus === "offline"
          ? "Computer offline"
          : localStatus === "check_before_running"
            ? "Check account and runtime before running"
            : "Setup required",
      href: `/app/${organizationId}/runners`,
      detail:
        "Pair your computer and connect your own eligible account. The companion and its isolated runtime must be ready. Review any preparation credits and task limits before starting.",
    },
  ];
  return (
    <fieldset className="task-runtime-picker">
      <legend>Where tasks run</legend>
      {options.map((option) => (
        <div className="task-runtime-option" key={option.id}>
          <label className="task-runtime-choice" aria-label={option.title}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              disabled={disabled || !option.available}
              onChange={() => {
                if (!disabled && option.available) onChange(option.id);
              }}
            />
            <span>
              <span className="task-runtime-title">
                {option.title}
                {option.id === "work_cloud" && (
                  <span className="task-runtime-recommended">Recommended</span>
                )}
              </span>
              <span className="task-runtime-description">
                {option.description}
              </span>
              <span className="task-runtime-status">{option.status}</span>
            </span>
          </label>
          <div className="task-runtime-actions">
            <Link href={option.href} prefetch={false}>
              {option.configured ? "Manage setup" : "Finish setup"}
              <span className="sr-only"> for {option.title}</span>
            </Link>
            <details>
              <summary>
                More info<span className="sr-only"> about {option.title}</span>
              </summary>
              <p>{option.detail}</p>
              <Link
                href={
                  option.id === "local"
                    ? "/help/connect-your-computer"
                    : "/help/processing-and-recovery"
                }
                prefetch={false}
              >
                Setup guide
              </Link>
            </details>
          </div>
        </div>
      ))}
    </fieldset>
  );
}
