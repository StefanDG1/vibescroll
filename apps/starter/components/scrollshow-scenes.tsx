"use client";
import Link from "next/link";
import Image from "next/image";
import { useId, useRef, useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
const captures: Record<
  string,
  {
    src: string;
    alt: string;
    width: number;
    height: number;
    caption: string;
    darkSrc?: string;
  }
> = {
  "Inside your library": {
    src: "/product/library-light-1440.png",
    darkSrc: "/product/library-dark-1440.png",
    alt: "Actual candidate Library at desktop width with synthetic topic branches and saved ideas, in light appearance.",
    width: 1440,
    height: 900,
    caption:
      "Synthetic Library records. Topic branches organize saved ideas; they do not grant access to another person's evidence.",
  },
  Save: {
    src: "/help/save-form.png",
    alt: "Actual candidate Save form with synthetic source type, title, URL and permission controls.",
    width: 390,
    height: 700,
    caption:
      "The candidate's manual Save form. Automatic assistant intake follows its separately approved processing settings.",
  },
  Library: {
    src: "/help/library-tree.png",
    alt: "Actual candidate mobile Library Tree with a synthetic source and its evidence link.",
    width: 390,
    height: 900,
    caption:
      "Synthetic Library Tree. Filing and evidence access have separate permissions.",
  },
  Projects: {
    src: "/help/project-draft.png",
    alt: "Actual candidate Projects screen with an editable synthetic private issue draft and publication-permission warnings.",
    width: 390,
    height: 700,
    caption:
      "A synthetic private issue draft, not an implementation plan or published issue. Repository permission and publication approval remain separate.",
  },
};
const scenes = {
  demo: [
    {
      label: "For your product",
      title: "An idea worth investigating.",
      text: "DemoPlanner opens on an empty screen. A labeled example could show what to do next. Inspect the evidence and review a small change.",
      state: "Useful to investigate",
      href: "/example",
      action: "Inspect the product example",
      items: [
        "Source: supplied demonstration text",
        "Evidence: show a useful example first",
        "Next step: review a reversible plan",
      ],
    },
    {
      label: "Inside your library",
      title: "The source stays beside the idea.",
      text: "Return to a saved source, read its main points and inspect the evidence. Keep personal notes separately from what the source says.",
      state: "Illustrative saved source",
      href: "/demo?view=library",
      action: "Explore the synthetic Library",
      items: ["Saved post", "Cited insight", "Your private note"],
    },
  ],
  features: [
    {
      label: "Save",
      title: "Keep the post worth revisiting.",
      text: "Save a supported link and return to its source, analysis and your own notes. Automatic analysis requires your current approved processing settings and a ready route. Unavailable or incomplete evidence stays clearly labeled.",
      state: "Saving follows your processing settings",
      href: "/help/share-a-post",
      action: "See source and sharing options",
      items: [
        "Paste a supported link",
        "Review source permission",
        "Review your processing settings",
      ],
    },
    {
      label: "Library",
      title: "Find an idea with evidence.",
      text: "Browse your own saved results and inspect their citations. The shared Pro catalog is a separate capability awaiting release acceptance.",
      state: "Your own library",
      href: "/demo?view=library",
      action: "Explore the synthetic Library",
      items: [
        "Source and main points",
        "Evidence and coverage",
        "Notes and filing",
      ],
    },
    {
      label: "Projects",
      title: "Check what fits your product.",
      text: "Use authorized GitHub context to review relevance, existing implementation and limitations before proposing a change.",
      state: "Project context requires permission",
      href: "/example",
      action: "See the project example",
      items: [
        "Selected repository context",
        "Useful, already built or no fit",
        "Your review comes next",
      ],
    },
    {
      label: "Plans",
      title: "Decide what to build next.",
      text: "Turn a useful recommendation into a plan you can inspect and edit. Approve implementation separately, with its repository, route and budget.",
      state: "A plan is not execution approval",
      href: "/example",
      action: "Read the example next steps",
      items: [
        "Inspect the proposed change",
        "Review checks and rollback",
        "Approve execution separately",
      ],
    },
  ],
};
/** All scenes are server-rendered and readable without JavaScript. */
export function ScrollShowScenes({ kind }: { kind: keyof typeof scenes }) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const interactive = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const choices = scenes[kind];
  return (
    <div className={`ss-scenes ss-scenes-${kind}`}>
      <div
        className="ss-tabs"
        role="tablist"
        aria-label={kind === "demo" ? "Example views" : "Workflow views"}
      >
        {choices.map((scene, index) => (
          <button
            key={scene.label}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              let next = selected;
              if (event.key === "ArrowRight")
                next = (index + 1) % choices.length;
              else if (event.key === "ArrowLeft")
                next = (index + choices.length - 1) % choices.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = choices.length - 1;
              else return;
              event.preventDefault();
              setSelected(next);
              buttons.current[next]?.focus();
            }}
          >
            {scene.label}
          </button>
        ))}
      </div>
      {choices.map((scene, index) => {
        const capture = captures[scene.label];
        return (
          <section
            key={scene.label}
            role="tabpanel"
            id={`${id}-panel-${index}`}
            aria-labelledby={`${id}-tab-${index}`}
            hidden={interactive && selected !== index}
            tabIndex={0}
            className="ss-scene"
          >
            <div className="ss-scene-art">
              <p className="ss-scene-label">
                {capture
                  ? "Actual candidate interface · Synthetic data"
                  : "Illustration · Synthetic data"}
              </p>
              {capture ? (
                <figure
                  className={`ss-capture ${capture.width < 600 ? "ss-capture-phone" : "ss-capture-desktop"}`}
                >
                  <a
                    href={capture.src}
                    aria-label={`Open the full-size ${scene.label} candidate capture`}
                  >
                    <Image
                      src={capture.src}
                      alt={capture.alt}
                      width={capture.width}
                      height={capture.height}
                      sizes={
                        capture.width < 600
                          ? "(max-width: 540px) calc(100vw - 80px), 312px"
                          : "(max-width: 850px) calc(100vw - 80px), 1024px"
                      }
                      loading="lazy"
                      unoptimized
                    />
                  </a>
                  <figcaption>
                    {capture.caption} Captured October 22, 2026, candidate{" "}
                    <code>76ec7bf</code>. No live processing or customer result
                    is shown.
                  </figcaption>
                  {capture.darkSrc && (
                    <details className="ss-capture-alternative">
                      <summary>Inspect the dark appearance capture</summary>
                      <a href={capture.darkSrc}>
                        <Image
                          src={capture.darkSrc}
                          alt="Actual candidate desktop Library with the same synthetic records, in dark appearance."
                          width={1440}
                          height={900}
                          sizes="(max-width: 850px) calc(100vw - 80px), 1024px"
                          loading="lazy"
                          unoptimized
                        />
                      </a>
                    </details>
                  )}
                </figure>
              ) : (
                <div className="ss-scene-window">
                  <div className="ss-window-bar">
                    <span />
                    <span />
                    <span />
                    <strong>{scene.label}</strong>
                  </div>
                  <p className="ss-scene-state">{scene.state}</p>
                  <ol>
                    {scene.items.map((item) => (
                      <li key={item}>
                        <span aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ol>
                  <p className="ss-scene-footnote">
                    No live processing or repository access shown
                  </p>
                </div>
              )}
            </div>
            <div className="ss-scene-caption">
              <h3>{scene.title}</h3>
              <p>{scene.text}</p>
              <Link href={scene.href}>{scene.action}</Link>
            </div>
          </section>
        );
      })}
    </div>
  );
}
