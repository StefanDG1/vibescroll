"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

const navigation = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/discover", label: "Discover" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
  { href: "/sign-in", label: "Sign in", prefetch: false },
] as const;

function Links() {
  const pathname = usePathname();
  return (
    <>
      {navigation.map((item) => (
        <Link
          aria-current={
            pathname === item.href
              ? "page"
              : pathname?.startsWith(`${item.href}/`)
                ? "location"
                : undefined
          }
          href={item.href}
          key={item.href}
          prefetch={"prefetch" in item ? item.prefetch : undefined}
        >
          {item.label}
        </Link>
      ))}
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
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target))
        element.open = false;
    };
    element.addEventListener("keydown", escape);
    element.addEventListener("click", follow);
    document.addEventListener("pointerdown", outside);
    return () => {
      element.removeEventListener("keydown", escape);
      element.removeEventListener("click", follow);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  return (
    <>
      <nav className="ss-desktop-nav" aria-label="Website">
        <Links />
      </nav>
      <details ref={menu} className="ss-mobile-nav">
        <summary>
          <span className="sr-only">Website menu</span>
          <Menu className="ss-menu-open" aria-hidden="true" size={22} />
          <X className="ss-menu-close" aria-hidden="true" size={22} />
        </summary>
        <nav aria-label="Mobile website">
          <Links />
        </nav>
      </details>
      <Link className="primary public-app-link" href="/app" prefetch={false}>
        Open app <ArrowUpRight aria-hidden="true" size={15} />
      </Link>
    </>
  );
}
