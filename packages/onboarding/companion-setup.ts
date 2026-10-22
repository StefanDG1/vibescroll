export type SetupAction =
  | "purpose"
  | "source"
  | "route"
  | "preflight"
  | "pair"
  | "account"
  | "worker"
  | "sample"
  | "assistant"
  | "project"
  | "import"
  | "preferences"
  | "pause"
  | "resume"
  | "startup_enable"
  | "startup_disable";
export type SetupSnapshot = {
  purposeSaved: boolean;
  sourceSaved: boolean;
  route?: "local" | "cloud" | "save_only";
  cloudAvailable: boolean;
  localEligible: boolean;
  prerequisitesChecked: boolean;
  paired: boolean;
  accountConnected: boolean;
  workerAvailable: boolean;
  sampleCited: boolean;
  assistantReviewed: boolean;
  projectConfirmed: boolean;
  importReviewed: boolean;
  preferencesReviewed: boolean;
  paused: boolean;
  startupEnabled: boolean;
};
export type SetupStep = {
  action: SetupAction;
  title: string;
  detail: string;
  complete: boolean;
  blocked?: boolean;
  help: string;
};
export function companionSetupSteps(
  s: SetupSnapshot,
  guided = false,
): SetupStep[] {
  const steps: SetupStep[] = [
    {
      action: "purpose",
      title: "Choose what you want to keep",
      detail:
        "Start with your library or an active project. You can change this later.",
      complete: s.purposeSaved,
      help: "/help/getting-started",
    },
    {
      action: "source",
      title: "Save your first source",
      detail:
        "Use a link or file you have permission to process. Saving alone starts no paid work.",
      complete: s.sourceSaved,
      help: "/docs",
    },
    {
      action: "route",
      title: "Choose how to process it",
      detail:
        s.route === "save_only"
          ? "Your source stays saved. Choose an available route whenever you want cited insights."
          : "Review an available local or cloud route and its limits before processing.",
      complete: Boolean(s.route),
      blocked:
        s.route === "local"
          ? !s.localEligible
          : s.route === "cloud"
            ? !s.cloudAvailable
            : false,
      help: "/docs",
    },
  ];
  if (s.route === "local")
    steps.push(
      {
        action: "preflight",
        title: "Check this computer",
        detail:
          "Run the local prerequisite check. It checks installed tools without downloading or starting a worker.",
        complete: s.prerequisitesChecked,
        help: "/docs",
      },
      {
        action: "pair",
        title: "Pair your computer",
        detail:
          "Compare its fingerprint and approve the short-lived request in your signed-in workspace.",
        complete: s.paired,
        help: "/docs",
      },
      {
        action: "account",
        title: "Connect your own account",
        detail:
          "Complete official account consent on the paired Windows computer. Credentials stay in protected local storage.",
        complete: s.accountConnected,
        help: "/docs",
      },
      {
        action: "worker",
        title: "Make your computer available",
        detail: s.paused
          ? "Your companion is paused. Resume it locally when you want approved work to continue."
          : "Keep the computer awake and start its companion. A paired computer can still be offline.",
        complete: s.workerAvailable && !s.paused,
        help: "/docs",
      },
    );
  if (s.route && s.route !== "save_only")
    steps.push({
      action: "sample",
      title: "Review a cited first result",
      detail:
        "Process one approved sample, then inspect its evidence and coverage. A saved link or connected badge is not a completed result.",
      complete: s.sampleCited,
      blocked:
        s.route === "cloud"
          ? !s.cloudAvailable
          : !s.localEligible ||
            !s.prerequisitesChecked ||
            !s.paired ||
            !s.accountConnected ||
            !s.workerAvailable ||
            s.paused,
      help: "/docs",
    });
  if (guided)
    steps.push(
      {
        action: "assistant",
        title: "Review assistant access",
        detail:
          "Choose its library scope and whether submitted links may be processed. Existing permissions remain unchanged until you review them.",
        complete: s.assistantReviewed,
        help: "/docs",
      },
      {
        action: "project",
        title: "Review a project",
        detail:
          "Optional: select a repository and confirm its purpose before evaluating ideas. Library-only use is complete on its own.",
        complete: s.projectConfirmed,
        help: "/docs",
      },
      {
        action: "import",
        title: "Preview saved-link imports",
        detail:
          "Optional: inspect links before importing. A batch needs its own scope and processing budget.",
        complete: s.importReviewed,
        help: "/docs",
      },
      {
        action: "preferences",
        title: "Review your preferences",
        detail:
          "Choose appearance and optional companion startup. Coding and publication keep their separate approvals.",
        complete: s.preferencesReviewed,
        help: "/docs",
      },
    );
  return steps;
}
