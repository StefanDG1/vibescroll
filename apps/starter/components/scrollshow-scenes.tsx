"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { useId, useRef, useState } from "react";

const scenes = [
  {
    label: "Save",
    title: "Save a post worth revisiting",
    description:
      "Paste a supported link and choose whether to analyze it. Saved posts stay in your library even when their source is unavailable.",
    href: "/help/share-a-post",
    action: "Read the sharing guide",
    image: "/product/public-workflow-save.webp",
    alt: "The Save a post dialog with a link field and optional analysis controls.",
    width: 390,
    height: 844,
  },
  {
    label: "Browse",
    title: "Check the idea against its source",
    description:
      "Browse saved posts, expand an insight, and see what the evidence supports before applying it to a project.",
    href: "/demo",
    action: "Open the Browse demo",
    image: "/product/public-workflow-browse.webp",
    alt: "Browse showing a saved post with its insight strip and project shortcuts.",
    width: 1440,
    height: 900,
  },
  {
    label: "Projects",
    title: "Find the right project",
    description:
      "Select a connected repository, review its context, and see the proposals that belong to it.",
    href: "/demo?view=projects",
    action: "Open the Projects demo",
    image: "/product/public-workflow-projects.webp",
    alt: "The Projects screen with a connected sample repository and two proposals.",
    width: 390,
    height: 844,
  },
  {
    label: "Plans",
    title: "Review the proposal",
    description:
      "Read the proposed change and look through the review queue. Implementation and issue publication each require approval.",
    href: "/demo?view=proposals",
    action: "Open the Proposals demo",
    image: "/product/public-workflow-plans.webp",
    alt: "The Proposals screen with one plan needing review and one accepted plan.",
    width: 1000,
    height: 760,
  },
];

export function ScrollShowScenes() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="ss-scenes workflow-scenes">
      <div className="ss-tabs" role="tablist" aria-label="Workflow examples">
        {scenes.map((scene, index) => (
          <button
            key={scene.label}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight")
                next = (index + 1) % scenes.length;
              else if (event.key === "ArrowLeft")
                next = (index + scenes.length - 1) % scenes.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = scenes.length - 1;
              else return;
              event.preventDefault();
              setSelected(next);
              tabs.current[next]?.focus();
            }}
          >
            {scene.label}
          </button>
        ))}
      </div>
      {scenes.map((scene, index) => (
        <section
          key={scene.label}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={selected !== index}
          tabIndex={0}
          className="ss-scene"
        >
          <div className="ss-scene-caption">
            <h3>{scene.title}</h3>
            <p>{scene.description}</p>
            <Link href={scene.href}>
              {scene.action} <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="ss-scene-art">
            <figure
              className={`ss-capture ${scene.width < 600 ? "ss-capture-phone" : "ss-capture-desktop"}`}
            >
              <figcaption>VibeScroll demo · Synthetic data</figcaption>
              <a
                href={scene.image}
                aria-label={`Open the full-size ${scene.label} screenshot`}
              >
                <Image
                  src={scene.image}
                  alt={scene.alt}
                  width={scene.width}
                  height={scene.height}
                  unoptimized
                />
              </a>
            </figure>
          </div>
        </section>
      ))}
      <noscript>
        <div className="public-support-links">
          {scenes.map((scene) => (
            <a key={scene.label} href={scene.href}>
              {scene.action}
            </a>
          ))}
        </div>
      </noscript>
    </div>
  );
}
