import Image from "next/image";
import { projectLabel } from "../lib/home-feed";
import styles from "./compact-projects.module.css";

const icons = {
  vibescroll: "/icon.svg",
  kinetexa: "/product/project-icons/kinetexa.svg",
  companynerve: "/product/project-icons/companynerve.svg",
};

export function ProjectMark({ name }: { name: string }) {
  const label = projectLabel(name);
  const key = label.toLowerCase() as keyof typeof icons;
  const icon = Object.hasOwn(icons, key) ? icons[key] : undefined;
  const letters = label
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
  return (
    <span className={styles.mark} aria-hidden="true">
      {icon ? (
        <Image src={icon} width={20} height={20} alt="" unoptimized />
      ) : (
        letters || "·"
      )}
    </span>
  );
}
