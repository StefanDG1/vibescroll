import Image from "next/image";
import Link from "next/link";
import styles from "./product-media.module.css";

const transcripts = {
  overview: "/product/overview-transcript.txt",
  setup: "/product/setup-walkthrough-transcript.txt",
};

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
      <div className={styles.overview}>
        <figure className={styles.figure}>
          <video
            className={styles.portrait}
            width={390}
            height={844}
            controls
            preload="none"
            playsInline
            poster="/product/overview-poster.png"
            aria-label="Synthetic candidate interface overview"
            aria-describedby={`${idPrefix}-overview-caption`}
          >
            <source src="/product/overview.mp4" type="video/mp4" />
            <track
              src="/product/overview.vtt"
              kind="captions"
              srcLang="en"
              label="English"
              default
            />
            <a href={transcripts.overview}>Read the overview transcript</a>
          </video>
          <figcaption id={`${idPrefix}-overview-caption`}>
            Synthetic candidate UI. Playback starts when you choose Play.
          </figcaption>
        </figure>
        <div className={styles.summary}>
          <h3>Inspect an idea before deciding</h3>
          <p>
            Browse the Library, open a source and inspect the supporting
            evidence. A project decision can be useful to investigate, already
            implemented or no fit. Keeping a plan grants no coding or
            publication permission.
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
