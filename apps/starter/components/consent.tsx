"use client";
import { useEffect } from "react";
import * as Consent from "vanilla-cookieconsent";
import { setAnalyticsConsent, track } from "@/lib/analytics";
import { publicPageEvent } from "@/lib/analytics-events";
export function rejectAnalytics() {
  Consent.acceptCategory([]);
  void setAnalyticsConsent(false);
}
export function openCookiePreferences() {
  // Another tab can change the cookie while this modal still has old switches.
  const cookie = Consent.getCookie();
  if (
    Consent.validConsent() &&
    cookie?.revision === 1 &&
    Array.isArray(cookie.categories)
  )
    Consent.acceptCategory(cookie.categories);
  Consent.showPreferences();
}
export function CookieSettings({ className = "" }: { className?: string }) {
  return (
    <button className={className} type="button" onClick={openCookiePreferences}>
      Cookie preferences
    </button>
  );
}
let initialized = false;
let lastPage = "";
export function ConsentProvider() {
  useEffect(() => {
    let lastChoice: string | undefined;
    const sync = () => {
      const cookie = Consent.getCookie();
      const valid = Consent.validConsent() && cookie?.revision === 1;
      const choice = valid
        ? JSON.stringify(cookie?.categories ?? [])
        : undefined;
      if (choice !== lastChoice) {
        lastChoice = choice;
        if (valid)
          window.dispatchEvent(new Event("vibescroll:consent-changed"));
      }
      const allowed = valid && cookie?.categories?.includes("analytics");
      if (!allowed) lastPage = "";
      void setAnalyticsConsent(Boolean(allowed))
        .then(() => {
          const event = publicPageEvent(window.location.pathname);
          if (
            event &&
            lastPage !== JSON.stringify(event) &&
            track(event.event, event.properties)
          )
            lastPage = JSON.stringify(event);
        })
        .catch(() => {
          void setAnalyticsConsent(false);
        });
    };
    if (!initialized) {
      initialized = true;
      void Consent.run({
        revision: 1,
        mode: "opt-in",
        manageScriptTags: false,
        disablePageInteraction: false,
        cookie: {
          name: "vs_consent",
          domain: window.location.hostname,
          path: "/",
          sameSite: "Lax",
          expiresAfterDays: 180,
        },
        guiOptions: {
          consentModal: {
            layout: "box inline",
            position: "bottom left",
            equalWeightButtons: true,
            flipButtons: false,
          },
          preferencesModal: { layout: "box", equalWeightButtons: true },
        },
        categories: {
          necessary: { enabled: true, readOnly: true },
          analytics: {},
        },
        onConsent: sync,
        onChange: sync,
        language: {
          default: "en",
          translations: {
            en: {
              consentModal: {
                title: "Optional analytics",
                description:
                  "Help us understand which parts of VibeScroll are useful. You can change this later.",
                acceptAllBtn: "Allow analytics",
                acceptNecessaryBtn: "Reject analytics",
                showPreferencesBtn: "Preferences",
                footer:
                  '<a href="/cookies">Cookie policy</a> <a href="/privacy">Privacy policy</a>',
              },
              preferencesModal: {
                title: "Cookie preferences",
                acceptAllBtn: "Allow analytics",
                acceptNecessaryBtn: "Reject analytics",
                savePreferencesBtn: "Save preferences",
                closeIconLabel: "Close preferences",
                sections: [
                  {
                    title: "Essential",
                    description:
                      "Sign-in, security and this consent choice. They are required for the app to work.",
                    linkedCategory: "necessary",
                    cookieTable: {
                      headers: {
                        name: "Storage",
                        purpose: "Purpose",
                        expiry: "Duration",
                      },
                      body: [
                        {
                          name: "vs_consent",
                          purpose: "Your consent choice",
                          expiry: "180 days",
                        },
                        {
                          name: "__Host-vibescroller-production",
                          purpose: "Secure WorkOS sign-in",
                          expiry:
                            "Browser expiry up to 400 days; server session limits also apply",
                        },
                        {
                          name: "wos-auth-verifier-*",
                          purpose: "Sign-in request verification",
                          expiry: "10 minutes, removed after sign-in",
                        },
                      ],
                    },
                  },
                  {
                    title: "Product analytics",
                    description:
                      "Optional PostHog events record approved actions, coarse states and counts. No replay, automatic click capture, content, account email, repository name or page URL. A random identifier stays in memory for this page session. Network providers still receive your IP address.",
                    linkedCategory: "analytics",
                  },
                  {
                    title: "Change your mind",
                    description:
                      'Use Cookie preferences in the app or website footer at any time. Turning analytics off stops future events. Events already sent follow the <a href="/privacy">privacy policy</a>.',
                  },
                ],
              },
            },
          },
        },
      })
        .then(sync)
        .catch(() => {
          initialized = false;
          void setAnalyticsConsent(false);
        });
    }
    sync();
    // Another tab may withdraw consent. Read the cookie again before subsequent activity.
    const focus = () => sync();
    window.addEventListener("focus", focus);
    const interval = window.setInterval(sync, 2000);
    return () => {
      window.removeEventListener("focus", focus);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
