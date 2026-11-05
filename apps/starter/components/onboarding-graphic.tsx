import {
  Bookmark,
  Lightbulb,
  FolderGit2,
  ArrowRight,
  MessageCircle,
  Coins,
  Link2,
  Check,
} from "lucide-react";
import styles from "./onboarding.module.css";

/** Product geometry, not a simulated analysis or a provider screenshot. */
export function OnboardingGraphic({
  kind = "ideas",
}: {
  kind?: "ideas" | "import" | "assistant" | "credits";
}) {
  if (kind === "credits")
    return (
      <div className={styles.routeGraphic}>
        <div>
          <Coins size={27} />
          <strong>In VibeScroll</strong>
          <span>Uses your credits</span>
        </div>
        <div>
          <MessageCircle size={27} />
          <strong>In your assistant</strong>
          <span>Uses its allowance</span>
        </div>
      </div>
    );
  const assistant = kind === "assistant";
  const nodes = assistant
    ? [
        { Icon: MessageCircle, text: "Your assistant" },
        { Icon: Link2, text: "Your ideas" },
        { Icon: Check, text: "Saved work" },
      ]
    : [
        {
          Icon: Bookmark,
          text: kind === "import" ? "Forgotten saves" : "Find it again",
        },
        { Icon: Lightbulb, text: "Useful ideas" },
        { Icon: FolderGit2, text: "Your projects" },
      ];
  return (
    <figure
      className={styles.storyGraphic}
      aria-label={
        assistant
          ? "Your assistant connects to your ideas and saves work back"
          : "Forgotten saved posts become useful ideas for your projects"
      }
    >
      {nodes.map(({ Icon, text }, i) => (
        <div className={styles.storyNode} key={text}>
          <div className={styles.storyTile} data-position={i}>
            <Icon
              size={i === 1 ? 37 : 30}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {i === 0 && !assistant && <span className={styles.stackBack} />}
          </div>
          <span>{text}</span>
          {i < nodes.length - 1 && (
            <ArrowRight
              className={styles.storyArrow}
              size={20}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </figure>
  );
}
