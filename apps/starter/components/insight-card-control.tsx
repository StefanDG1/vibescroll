"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  Compass,
  ListChecks,
  Lightbulb,
  Code,
  ChartNoAxesCombined,
  Megaphone,
  UsersRound,
  Palette,
  Shield,
  Workflow,
  BookOpen,
  Heart,
  Wrench,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { InsightIconKey } from "../../../packages/insights/presentation";
const icons = {
  compass: Compass,
  checklist: ListChecks,
  lightbulb: Lightbulb,
  code: Code,
  chart: ChartNoAxesCombined,
  megaphone: Megaphone,
  users: UsersRound,
  palette: Palette,
  shield: Shield,
  workflow: Workflow,
  book: BookOpen,
  heart: Heart,
  wrench: Wrench,
};

/** Shared with the Library. Actions remain siblings of the expansion button. */
export function InsightCardControl({
  title,
  subtitle,
  icon,
  expanded,
  hasBadge,
  children,
  ...button
}: {
  title: string;
  subtitle: string;
  icon: InsightIconKey;
  expanded: boolean;
  hasBadge?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const Icon = icons[icon];
  return (
    <div className="hybrid-insight-card-control">
      <button
        type="button"
        className="hybrid-insight-select"
        aria-expanded={expanded}
        data-has-bubble={!!hasBadge}
        {...button}
      >
        <span
          className="hybrid-insight-icon"
          data-icon={icon}
          data-tone={Object.keys(icons).indexOf(icon) % 4}
        >
          <Icon aria-hidden="true" />
        </span>
        <span className="hybrid-insight-copy">
          <strong title={title}>{title}</strong>
          <small>
            <FileText size={14} aria-hidden="true" />
            <span className="hybrid-source-label" title={subtitle}>
              {subtitle}
            </span>
          </small>
        </span>
        {hasBadge && (
          <span className="hybrid-proposal-slot" aria-hidden="true" />
        )}
        {expanded ? (
          <ChevronDown size={18} aria-hidden="true" />
        ) : (
          <ChevronRight size={18} aria-hidden="true" />
        )}
      </button>
      {children}
    </div>
  );
}
