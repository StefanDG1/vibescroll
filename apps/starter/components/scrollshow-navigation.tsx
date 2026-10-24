"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

function Links() {
  return (
    <>
      <Link href="/how-it-works">How it works</Link>
      <Link href="/#insight-library">Insight library</Link>
      <Link href="/pricing">Pricing</Link>
      <Link href="/help">Help</Link>
      <Link href="/app" prefetch={false}>
        Sign in
      </Link>
      <Link className="primary" href="/app" prefetch={false}>
        Try one post
      </Link>
    </>
  );
}

export function ScrollShowNavigation() {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && element.open) {
        element.open = false;
        element.querySelector("summary")?.focus();
      }
    };
    const follow = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a"))
        element.open = false;
    };
    element.addEventListener("keydown", escape);
    element.addEventListener("click", follow);
    return () => {
      element.removeEventListener("keydown", escape);
      element.removeEventListener("click", follow);
    };
  }, []);
  return (
    <>
      <nav className="ss-desktop-nav" aria-label="Website">
        <Links />
      </nav>
      <details ref={menu} className="ss-mobile-nav">
        <summary>
          <span className="ss-menu-open">Open menu</span>
          <span className="ss-menu-close">Close menu</span>
        </summary>
        <nav aria-label="Mobile website">
          <Links />
        </nav>
      </details>
      <Link className="primary ss-mobile-action" href="/app" prefetch={false}>
        Try one post
      </Link>
    </>
  );
}
