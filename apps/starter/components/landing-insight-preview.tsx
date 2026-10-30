"use client";

import Link from "next/link";
import { FileVideo, ArrowUpRight } from "lucide-react";
import { useId, useState } from "react";
import { InsightCardControl } from "./insight-card-control";
import styles from "./landing-insight-preview.module.css";

// Authored demonstration only. No account, evidence, player or processing calls.
const insights = [
  {
    title: "Show an example before setup",
    icon: "lightbulb" as const,
    detail:
      "Let someone explore a useful result before asking them to connect a project.",
  },
  {
    title: "Keep the next step optional",
    icon: "workflow" as const,
    detail:
      "Offer a clear way to start fresh. Connecting a project can come later.",
  },
];

export function LandingInsightPreview() {
  const id = useId();
  const [expanded, setExpanded] = useState<number | null>(0);
  return (
    <figure
      className={styles.preview}
      aria-label="Saved post to insights example"
    >
      <figcaption className={styles.caption}>Synthetic example</figcaption>
      <div className={styles.source}>
        <p className={styles.stage}>Saved post</p>
        <div className={styles.post}>
          <FileVideo size={28} aria-hidden="true" />
          <strong>Make the first screen useful.</strong>
          <p>
            Show an editable example before asking someone to connect a project.
            Let them explore or start fresh.
          </p>
        </div>
      </div>
      <div className={styles.insights}>
        <p className={styles.stage}>Useful insights</p>
        {insights.map((insight, index) => (
          <div className={styles.card} key={insight.title}>
            <InsightCardControl
              title={insight.title}
              subtitle="From this sample post"
              icon={insight.icon}
              expanded={expanded === index}
              aria-controls={`${id}-insight-${index}`}
              onClick={() => setExpanded(expanded === index ? null : index)}
            >
              <div
                className={styles.detail}
                id={`${id}-insight-${index}`}
                hidden={expanded !== index}
              >
                <p>{insight.detail}</p>
              </div>
            </InsightCardControl>
          </div>
        ))}
        <Link className={styles.example} href="/example">
          Explore the example <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </figure>
  );
}
