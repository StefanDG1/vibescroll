"use client";
import { useEffect, useSyncExternalStore } from "react";
const key = "vibescroll-theme";
type Theme = "system" | "light" | "dark";
let fallback: Theme = "system";
function snapshot(): Theme {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return fallback;
  }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("vibescroll-theme", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("vibescroll-theme", listener);
  };
}
export function AppTheme({ control = false }: { control?: boolean }) {
  const theme = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "system" as Theme,
  );
  useEffect(() => {
    if (control) return;
    const root = document.documentElement;
    const previous = root.dataset.appTheme;
    const previousScheme = root.style.colorScheme;
    const device = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (device.matches ? "dark" : "light") : theme;
      root.dataset.appTheme = resolved;
      root.style.colorScheme = resolved;
    };
    apply();
    device.addEventListener("change", apply);
    return () => {
      device.removeEventListener("change", apply);
      if (previous) root.dataset.appTheme = previous;
      else delete root.dataset.appTheme;
      root.style.colorScheme = previousScheme;
    };
  }, [theme, control]);
  if (!control) return null;
  return (
    <fieldset className="atlas-theme">
      <legend className="sr-only">Color theme</legend>
      {(["system", "light", "dark"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => {
            fallback = value;
            try {
              localStorage.setItem(key, value);
            } catch {
              /* Page-only preference. */
            }
            window.dispatchEvent(new Event("vibescroll-theme"));
          }}
        >
          {value === "system"
            ? "Device setting"
            : value === "light"
              ? "Light"
              : "Dark"}
        </button>
      ))}
    </fieldset>
  );
}
