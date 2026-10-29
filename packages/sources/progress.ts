type ProgressSource = {
  generation?: number;
  state?: string;
  personalMedia?: { version?: string; stage?: string; updatedAt?: number };
  personalAnalysis?: {
    executor?: string;
    state?: string;
    stage?: string;
    expiresAt?: number;
    leaseUntil?: number;
  };
  pendingAnalysisAttemptState?: string;
  workCloudSaveIntent?: {
    generation: number;
    analysisGeneration?: number;
    expiresAt: number;
  };
  workCloudLinkSetup?: { monitorReady: boolean } | null;
};

export type SourceProgress = {
  title: string;
  description: string;
  busy: boolean;
  action?: "setup" | "analysis";
};

/** Display only. This never authorizes, retries or changes a job. */
export function sourceProgress(
  source: ProgressSource,
  now: number,
): SourceProgress | null {
  if (source.personalMedia?.version === "service-preparation-progress-v1") {
    const stage = source.personalMedia.stage;
    const titles: Record<string, string> = {
      queued: "Video queued",
      starting: "Starting media worker",
      metadata: "Reading post details",
      downloading: "Downloading video",
      preparing: "Preparing screenshots and audio",
      transcribing: "Preparing the transcript",
      evidence_ready: "Evidence saved",
      waiting_for_assistant: "Waiting for your VibeScroll Assistant",
      analyzing: "Analyzing transcript and screenshots",
      validating: "Checking the insights",
    };
    if (stage && titles[stage])
      return {
        title: titles[stage],
        busy: true,
        description:
          "This page updates automatically. You can leave and return later.",
      };
    if (stage === "unknown" || stage === "failed")
      return {
        title: "Processing needs attention",
        busy: false,
        description:
          "Completion is not confirmed. Your saved post and previous analysis are still available.",
        action: "analysis",
      };
  }
  const pending = source.pendingAnalysisAttemptState;
  if (pending === "queued" || pending === "running")
    return {
      title: pending === "queued" ? "New analysis queued" : "Reanalyzing",
      description:
        "Your current analysis stays available while the new version is prepared.",
      busy: true,
    };
  if (pending === "unknown")
    return {
      title: "New analysis needs attention",
      description:
        "The new attempt has no confirmed outcome. Your current analysis is still available. Review its status before trying again.",
      busy: false,
      action: "analysis",
    };
  if (source.state === "ready") return null;
  const job = source.personalAnalysis;
  if (job && job.executor !== "work_cloud") return null;
  if (job) {
    if (job.state === "unknown")
      return {
        title: "Analysis needs attention",
        description:
          "Processing has no confirmed outcome. Review its status before trying again.",
        busy: false,
        action: "analysis",
      };
    if (job.state === "queued") {
      if (job.expiresAt !== undefined && job.expiresAt <= now)
        return {
          title: "Analysis request expired",
          description:
            "Cloud did not start this request in time. Your post is saved. Review the analysis options to continue.",
          busy: false,
          action: "analysis",
        };
      return {
        title: "Waiting for Cloud",
        description:
          "Your request is queued. Video processing has not started yet.",
        busy: true,
        action: "setup",
      };
    }
    if (job.state === "running") {
      if (job.leaseUntil !== undefined && job.leaseUntil <= now)
        return {
          title: "Checking analysis status",
          description:
            "The last processing lease expired. Completion is not confirmed. Review status before starting another attempt.",
          busy: false,
          action: "analysis",
        };
      return {
        title:
          job.stage === "acquiring"
            ? "Preparing video and transcript"
            : "Analyzing the evidence",
        description:
          "Cloud is processing your post. This page updates automatically. You can leave it and return later.",
        busy: true,
      };
    }
    if (["failed", "cancelled", "expired"].includes(job.state ?? ""))
      return {
        title: "Analysis stopped",
        description:
          "No completed analysis was saved for this request. Review the analysis options below to continue.",
        busy: false,
        action: "analysis",
      };
  }
  const intent = source.workCloudSaveIntent;
  if (
    intent &&
    intent.generation === source.generation &&
    intent.analysisGeneration === undefined
  ) {
    if (intent.expiresAt <= now)
      return {
        title: "Analysis request expired",
        description:
          "Your post is still saved. Review Cloud setup before requesting analysis again.",
        busy: false,
        action: "setup",
      };
    const needsSetup = source.workCloudLinkSetup?.monitorReady === false;
    return {
      title: needsSetup ? "Cloud setup needs attention" : "Waiting for ChatGPT",
      description: needsSetup
        ? "Your link is saved, but the Cloud connection is not ready to receive it. Open setup to continue."
        : "Your link is saved. ChatGPT has not started video processing yet. This page updates automatically.",
      busy: !needsSetup,
      action: "setup",
    };
  }
  if (
    source.workCloudLinkSetup &&
    ["saved", "needs_upload"].includes(source.state ?? "")
  )
    return {
      title: "Saved, not analyzing",
      description:
        "No analysis is running for this post. Use the analysis options below to start.",
      busy: false,
      action: "analysis",
    };
  return null;
}

/** A request timeout must never hide a retained post. */
export function sourceProgressDeadline(source: ProgressSource) {
  const job = source.personalAnalysis;
  if (job?.state === "queued") return job.expiresAt ?? Infinity;
  if (job?.state === "running") return job.leaseUntil ?? Infinity;
  return source.workCloudSaveIntent?.analysisGeneration === undefined
    ? (source.workCloudSaveIntent?.expiresAt ?? Infinity)
    : Infinity;
}
