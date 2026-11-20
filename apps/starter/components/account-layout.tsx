import Link from "next/link";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { AppTheme } from "./app-theme";
import "./account-screens.css";

type BackLink = { href: string; label: string };

export function AccountBack({ href, label }: BackLink) {
  return (
    <Link href={href} prefetch={false} className="account-back">
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}

export function AccountPageFrame({
  title,
  description,
  back = { href: "/app", label: "Back to app" },
  children,
}: {
  title: string;
  description?: ReactNode;
  back?: BackLink;
  children: ReactNode;
}) {
  return (
    <div className="account-standalone">
      <AppTheme />
      <main id="main" className="account-standalone-main">
        <AccountBack {...back} />
        <header className="account-heading">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        <div className="account-content">{children}</div>
      </main>
    </div>
  );
}

export function AccountSection({
  title,
  description,
  icon: Icon,
  trailing,
  headingRef,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  trailing?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`account-section ${className}`}>
      <header className="account-section-heading">
        {Icon && (
          <span className="account-icon" aria-hidden="true">
            <Icon size={19} strokeWidth={1.7} />
          </span>
        )}
        <div>
          <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
            {title}
          </h2>
          {description && <p>{description}</p>}
        </div>
        {trailing && <div className="account-section-trailing">{trailing}</div>}
      </header>
      {children}
    </section>
  );
}

export function AccountLink({
  title,
  description,
  icon: Icon,
  href,
  onClick,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
} & (
  { href: string; onClick?: never } | { href?: never; onClick: () => void }
)) {
  const contents = (
    <>
      <span className="account-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.7} />
      </span>
      <span className="account-link-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </span>
      <ChevronRight className="account-chevron" size={17} aria-hidden="true" />
    </>
  );
  return href ? (
    <Link className="account-link" href={href} prefetch={false}>
      {contents}
    </Link>
  ) : (
    <button className="account-link" onClick={onClick} type="button">
      {contents}
    </button>
  );
}

export function AccountStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "attention";
}) {
  return (
    <span className="account-status" data-tone={tone}>
      {children}
    </span>
  );
}
