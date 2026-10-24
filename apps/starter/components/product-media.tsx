import Image from "next/image";
import Link from "next/link";
import styles from "./product-media.module.css";

const transcripts = {
  overview: "/product/overview-transcript.txt",
  setup: "/product/setup-walkthrough-transcript.txt",
};
const edits = {
  overview: {
    title: "Product overview",
    duration: 40,
    mobileHeight: 900,
    mobile: "overview",
    desktop: "overview-desktop",
    description:
      "Follow a synthetic source through evidence, a private issue draft and a no-fit decision. The issue draft is not an implementation plan.",
  },
  library: {
    title: "Explore your Library",
    duration: 24,
    mobileHeight: 1100,
    mobile: "library-mobile",
    desktop: "library-desktop",
    description:
      "Inspect the approved light and dark Library captures and their source evidence. This shows synthetic private Library records, not access to the shared Pro catalog.",
  },
  social: {
    title: "Save, inspect and decide",
    duration: 20,
    mobileHeight: 900,
    mobile: "social-mobile",
    desktop: "social-desktop",
    description:
      "A short synthetic walkthrough of manual Save, cited evidence, a private issue draft and no fit. Nothing is published or processed in this edit.",
  },
} as const;
type Edit = keyof typeof edits;
function EditedVideo({
  edit,
  desktop = false,
  idPrefix,
}: {
  edit: Edit;
  desktop?: boolean;
  idPrefix: string;
}) {
  const item = edits[edit];
  const stem = desktop ? item.desktop : item.mobile;
  const captionId = `${idPrefix}-${edit}-${desktop ? "desktop" : "mobile"}-caption`;
  return (
    <figure className={styles.figure}>
      <video
        className={desktop ? styles.landscape : styles.portrait}
        width={desktop ? 1280 : 390}
        height={desktop ? 900 : item.mobileHeight}
        controls
        preload="none"
        playsInline
        poster={`/product/${stem}-poster.png`}
        aria-label={`${item.title}, synthetic candidate ${desktop ? "desktop" : "mobile"} edit, ${item.duration} seconds`}
        aria-describedby={captionId}
      >
        <source src={`/product/${stem}.mp4`} type="video/mp4" />
        <source src={`/product/${stem}.webm`} type="video/webm" />
        <track
          src={`/product/${edit}.vtt`}
          kind="captions"
          srcLang="en"
          label="English"
          default
        />
        <a href={`/product/${edit}-transcript.txt`}>
          Read the complete transcript
        </a>
      </video>
      <figcaption id={captionId}>
        Edited synthetic candidate captures, October 22, 2026, source{" "}
        <code>76ec7bf</code>. Editorial holds are not processing times. Playback
        starts when you choose Play.
      </figcaption>
    </figure>
  );
}
function EditLinks({ edit }: { edit: Edit }) {
  const item = edits[edit];
  return (
    <div className={styles.links}>
      <a href={`/product/${edit}-transcript.txt`}>Read the transcript</a>
      <a href={`/product/${edit}-storyboard.txt`}>
        Read the static walkthrough
      </a>
      <a href={`/product/${item.mobile}.mp4`} download>
        Download mobile MP4
      </a>
      <a href={`/product/${item.desktop}.mp4`} download>
        Download desktop MP4
      </a>
    </div>
  );
}
function DesktopEdit({ edit, idPrefix }: { edit: Edit; idPrefix: string }) {
  return (
    <details className={styles.alternative}>
      <summary>
        Watch the {edits[edit].title.toLowerCase()} desktop alternative
      </summary>
      <p>
        Complete source captures are scaled and letterboxed. No interface state
        is invented or cropped to imply a result.
      </p>
      <EditedVideo edit={edit} desktop idPrefix={idPrefix} />
    </details>
  );
}

/** Local, reviewed media only. The caller publishes the component with its assets. */
export function ProductMedia({
  variant = "full",
  idPrefix = "product-media",
}: {
  variant?: "full" | "overview";
  idPrefix?: string;
}) {
  return (
    <section className={styles.media} aria-labelledby={`${idPrefix}-title`}>
      <h2 id={`${idPrefix}-title`}>See the source-to-decision trail</h2>
      <p>
        Edited screen captures of the actual candidate interface with synthetic
        data, assembled into silent captioned videos. They demonstrate
        navigation and review, with no live processing, sign-in, pairing or
        successful sample run.
      </p>
      <p>
        The Save scenes use manual analysis. With automatic analysis off, saving
        leaves the post ready for a later decision. Automatic processing
        requires its own current permission and an available processing route.
      </p>
      <div className={styles.overview}>
        <EditedVideo edit="overview" idPrefix={idPrefix} />
        <div className={styles.summary}>
          <h3>Inspect an idea before deciding</h3>
          <p>
            Browse the Library, open a source and inspect the supporting
            evidence. A project decision can be useful to investigate, already
            implemented or no fit. The editable private issue draft grants no
            coding or publication permission and is not an implementation plan.
          </p>
          <p>
            <a href={transcripts.overview}>Read the overview transcript</a>
            {" · "}
            <Link href="/demo?view=library">Explore the synthetic Library</Link>
          </p>
          <p>
            The still images below provide a static alternative. The example
            text explains the decision without requiring video or images.
          </p>
        </div>
      </div>
      <EditLinks edit="overview" />
      <DesktopEdit edit="overview" idPrefix={idPrefix} />

      {variant === "full" &&
        (["library", "social"] as const).map((edit) => (
          <section key={edit} aria-labelledby={`${idPrefix}-${edit}-title`}>
            <h3 id={`${idPrefix}-${edit}-title`}>{edits[edit].title}</h3>
            <p>
              {edits[edit].description} {edits[edit].duration} seconds, with
              silent captions.
            </p>
            <EditedVideo edit={edit} idPrefix={idPrefix} />
            <EditLinks edit={edit} />
            <DesktopEdit edit={edit} idPrefix={idPrefix} />
          </section>
        ))}

      {variant === "full" && (
        <section aria-labelledby={`${idPrefix}-setup-title`}>
          <h3 id={`${idPrefix}-setup-title`}>Review setup before connecting</h3>
          <p id={`${idPrefix}-setup-status`}>
            This walkthrough shows the public Help guide and synthetic
            Connections screen. Signed installation, account eligibility,
            pairing and a first processing result still need separate
            verification. A saved prerequisite report does not prove that
            processing works or grant assistant access.
          </p>
          <p>
            The final screen is a private issue draft, not an implementation
            plan. Its caption band was corrected while preserving the original
            UI sequence and 90-second timing. This does not verify an actual
            setup or processing result.
          </p>
          <figure className={styles.figure}>
            <video
              className={styles.landscape}
              width={1280}
              height={840}
              controls
              preload="none"
              playsInline
              poster="/product/setup-poster.png"
              aria-label="Synthetic candidate setup walkthrough"
              aria-describedby={`${idPrefix}-setup-status ${idPrefix}-setup-caption`}
            >
              <source src="/product/setup-walkthrough.mp4" type="video/mp4" />
              <track
                src="/product/setup-walkthrough.vtt"
                kind="captions"
                srcLang="en"
                label="English"
                default
              />
              <a href={transcripts.setup}>Read the setup transcript</a>
            </video>
            <figcaption id={`${idPrefix}-setup-caption`}>
              Edited synthetic candidate UI. No real account is connected and no
              processing is started in this walkthrough.
            </figcaption>
          </figure>
          <p>
            <a href={transcripts.setup}>Read the setup transcript</a>
            {" · "}
            <Link href="/help/getting-started">
              Read the getting-started guide
            </Link>
          </p>
        </section>
      )}

      <section aria-labelledby={`${idPrefix}-gallery-title`}>
        <h3 id={`${idPrefix}-gallery-title`}>Library in light and dark</h3>
        <p>
          Actual candidate screens with synthetic Library records, at desktop
          and phone widths. Open any still image to inspect it at full size.
        </p>
        <div className={styles.gallery}>
          {(["light", "dark"] as const).map((theme) => (
            <div className={styles.theme} key={theme}>
              <h4>{theme === "light" ? "Light" : "Dark"} appearance</h4>
              {([1440, 390] as const).map((width) => {
                const src = `/product/library-${theme}-${width}.png`;
                return (
                  <figure className={styles.figure} key={width}>
                    <a
                      href={src}
                      className={width === 390 ? styles.phone : undefined}
                    >
                      <Image
                        src={src}
                        width={width}
                        height={900}
                        sizes={
                          width === 390
                            ? "195px"
                            : "(max-width: 640px) 100vw, 50vw"
                        }
                        alt={`Synthetic Library in ${theme} appearance at ${width === 390 ? "phone" : "desktop"} width. Topic branches group saved ideas for evidence review.`}
                        unoptimized
                      />
                    </a>
                    <figcaption>
                      {theme === "light" ? "Light" : "Dark"},{" "}
                      {width === 390 ? "phone" : "desktop"}
                      {" · "}
                      <a href={src}>Open full-size image</a>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
