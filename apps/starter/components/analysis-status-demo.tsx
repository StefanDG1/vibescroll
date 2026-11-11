"use client";
import { useRef, useState } from "react";
import { SourceProgressPanel } from "./source-progress";
import { UsageSummary } from "./usage-summary";
import { usageOverview } from "../../../packages/billing/usage-overview";
import { ProjectFitBreakdown } from "./assistant-elements/project-fit-breakdown";
import { suggestProjects } from "../lib/project-suggestions";

const stages = [
  ["queued", "Queued"],
  ["metadata", "Reading post details"],
  ["transcribing", "Preparing transcript"],
  ["waiting_for_assistant", "Waiting for assistant"],
  ["analyzing", "Analyzing"],
  ["validating", "Saving insights"],
  ["failed", "Failed"],
  ["unknown", "Outcome unknown"],
] as const;

export function AnalysisStatusDemo() {
  const [stage, setStage] = useState<string>("analyzing");
  const options = useRef<HTMLDetailsElement>(null);
  return (
    <div className="analysis-status-demo">
      <label>
        Example analysis state
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        >
          {stages.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <SourceProgressPanel
        source={{
          state: "processing",
          personalMedia: {
            version: "service-preparation-progress-v1",
            stage,
          },
        }}
        now={0}
        organizationId="demo"
        onReviewAnalysis={() => {
          if (options.current) {
            options.current.open = true;
            options.current.focus();
          }
        }}
      />
      <details ref={options} id="post-processing-options" tabIndex={-1}>
        <summary>Example processing options</summary>
        <p>
          This is a status preview. No job, retry, credit charge or setup change
          is available here.
        </p>
      </details>
      <section className="panel">
        <h2>Synthetic project fit</h2>
        <ProjectFitBreakdown
          projectName="demo/product"
          fit={
            suggestProjects(
              { categoryKeys: ["product_design", "coding", "marketing"] },
              [
                {
                  _id: "demo",
                  fullName: "demo/product",
                  enabled: true,
                  confirmed: true,
                  status: "connected",
                  profile: "purpose: Software design tools",
                },
              ],
            ).items[0].fit
          }
        />
      </section>
      <UsageSummary
        organizationId="demo"
        usage={usageOverview(
          {
            wallet: {},
            pools: [
              { granted: 300, spent: 101, reserved: 19 },
              { granted: 50, spent: 20, reserved: 10, expiresAt: 100 },
            ],
            entries: [],
          },
          100,
        )}
      />
    </div>
  );
}
