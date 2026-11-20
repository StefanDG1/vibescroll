"use client";

import Link from "next/link";
import { Bookmark, ArrowUpRight, Quote } from "lucide-react";
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
      <figcaption className={styles.caption}>
        <Bookmark size={17} aria-hidden="true" />
        <span>From a saved post</span>
        <small>Synthetic example</small>
      </figcaption>
      <div className={styles.source}>
        <p className={styles.stage}>Source passage</p>
        <div className={styles.post}>
          <Quote size={22} aria-hidden="true" />
          <blockquote>
            Show an editable example before asking someone to connect a project.
            Let them explore or start fresh.
          </blockquote>
        </div>
      </div>
      <div className={styles.insights}>
        <p className={styles.stage}>Insights</p>
        {insights.map((insight, index) => (
          <div className={styles.card} key={insight.title}>
            <InsightCardControl
              title={insight.title}
              icon={insight.icon}
              expanded={expanded === index}
              disclosure="plus"
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
          Open the full example <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </figure>
  );
}
