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
  route?: "local" | "cloud" | "save_only" | "work_cloud";
  workCloudAvailable?: boolean;
  cloudAvailable: boolean;
  // Feature availability only; never host, account, execution or media readiness.
  workCloudTextState?: "unavailable" | "available_unverified";
  localEligible: boolean;
  prerequisitesChecked: boolean;
  connectionPrerequisitesChecked?: boolean;
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
      help: "/help/first-useful-insight",
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
            : s.route === "work_cloud"
              ? !s.workCloudAvailable
              : false,
      help: "/help/processing-and-recovery",
    },
  ];
  if (s.route === "local")
    steps.push(
      {
        action: "pair",
        title: "Pair your computer",
        detail:
          "Compare its fingerprint and approve the short-lived request in your signed-in workspace.",
        complete: s.paired,
        help: "/help/connect-your-computer",
      },
      {
        action: "preflight",
        title: "Check this computer",
        detail: s.accountConnected
          ? "Run the prerequisite check again after connecting. Record the full report before approving a sample."
          : "Run the prerequisite check after pairing. A ready-to-connect report permits official sign-in; it does not establish processing readiness.",
        complete:
          s.prerequisitesChecked ||
          (!s.accountConnected && s.connectionPrerequisitesChecked === true),
        help: "/help/connect-your-computer",
      },
      {
        action: "account",
        title: "Connect your own account",
        detail:
          "Start the companion once and follow its official account consent. Credentials stay in protected local storage. A saved login alone does not verify current model access.",
        complete: s.accountConnected,
        help: "/help/connect-your-computer",
      },
      {
        action: "worker",
        title: "Make your computer available",
        detail: s.paused
          ? "Your companion is paused. Resume it locally when you want approved work to continue."
          : "Keep the computer awake and start its companion. A paired computer can still be offline.",
        complete: s.workerAvailable && !s.paused,
        help: "/help/connect-your-computer",
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
          : s.route === "work_cloud"
            ? !s.workCloudAvailable
            : !s.localEligible ||
              !s.prerequisitesChecked ||
              !s.paired ||
              !s.accountConnected ||
              !s.workerAvailable ||
              s.paused,
      help: "/help/first-useful-insight",
    });
  if (guided)
    steps.push(
      {
        action: "assistant",
        title: "Review assistant access",
        detail:
          "Choose its library scope and whether submitted links may be processed. Existing permissions remain unchanged until you review them.",
        complete: s.assistantReviewed,
        help: "/help/actions-and-publication",
      },
      {
        action: "project",
        title: "Review a project",
        detail:
          "Optional: select a repository and confirm its purpose before evaluating ideas. Library-only use is complete on its own.",
        complete: s.projectConfirmed,
        help: "/help/evaluate-an-idea-for-a-project",
      },
      {
        action: "import",
        title: "Preview saved-link imports",
        detail:
          "Optional: inspect links before importing. A batch needs its own scope and processing budget.",
        complete: s.importReviewed,
        help: "/help/imports-and-data",
      },
      {
        action: "preferences",
        title: "Review your preferences",
        detail:
          "Choose appearance and optional companion startup. Coding and publication keep their separate approvals.",
        complete: s.preferencesReviewed,
        help: "/help/connect-your-computer",
      },
    );
  return steps;
}
