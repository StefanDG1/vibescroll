"use client";
import { useEffect, useEffectEvent } from "react";
import { analyticsCampaign, safeAnalyticsEvent } from "./analytics-events";
import { cookieAllowsAnalytics } from "./analytics-consent";
import type { PostHog } from "posthog-js";
let sdk: PostHog | undefined;
let allowed = false;
let generation = 0;
let journeyId: string | undefined;
let engagementExpiry = 0;
const journeyKey = "vibescroll.analytics.journey";
const campaignKey = "vibescroll.analytics.campaign";
const engagementKey = "vibescroll.analytics.engagement";
const eligibleEngagement = new Set(["citation_inspected", "plan_saved"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const week = 7 * 24 * 60 * 60_000;
export const analyticsReadyEvent = "vibescroll:analytics-ready";
const checkoutKey = "vibescroll.analytics.checkout";
function sessionValue(key: string, value?: string) {
  try {
    if (value !== undefined) window.sessionStorage.setItem(key, value);
    return window.sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
export function clearAnalyticsJourney() {
  journeyId = undefined;
  engagementExpiry = 0;
  try {
    for (const key of [journeyKey, campaignKey, checkoutKey])
      window.sessionStorage.removeItem(key);
  } catch {
    /* Storage can be disabled. */
  }
  try {
    window.localStorage.removeItem(engagementKey);
  } catch {
    /* A durable identifier is optional. */
  }
}
function storedEngagement() {
  try {
    const record = window.localStorage.getItem(engagementKey);
    const [id, until] = record?.split(":") ?? [];
    const expiry = Number(until);
    const now = Date.now();
    if (id && uuidPattern.test(id) && expiry > now && expiry <= now + week)
      return { id, expiry };
    if (record) {
      window.localStorage.removeItem(engagementKey);
      if (id === sessionValue(journeyKey)) sessionValue(journeyKey, "");
    }
  } catch {
    /* Keep tab-only analytics when storage is unavailable. */
  }
}
function getJourneyId() {
  if (engagementExpiry && engagementExpiry <= Date.now()) {
    journeyId = undefined;
    engagementExpiry = 0;
    sessionValue(journeyKey, "");
  }
  if (!journeyId) {
    const previous = storedEngagement();
    const tab = sessionValue(journeyKey);
    journeyId =
      previous?.id ??
      (tab && uuidPattern.test(tab) ? tab : crypto.randomUUID());
    engagementExpiry = previous?.expiry ?? 0;
    sessionValue(journeyKey, journeyId);
  }
  return journeyId;
}
function retainEngagement() {
  if (engagementExpiry > Date.now()) return;
  const existing = storedEngagement();
  if (existing) {
    journeyId = existing.id;
    engagementExpiry = existing.expiry;
    sessionValue(journeyKey, journeyId);
    return;
  }
  try {
    const id = getJourneyId();
    const expiry = Date.now() + week;
    window.localStorage.setItem(engagementKey, [id, expiry].join(":"));
    engagementExpiry = expiry;
  } catch {
    /* Engagement remains measurable for this tab. */
  }
}
function consentStillAllowed() {
  return (
    allowed &&
    cookieAllowsAnalytics(document.cookie) &&
    navigator.doNotTrack !== "1" &&
    !(navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  );
}
export async function setAnalyticsConsent(consented: boolean) {
  const next =
    consented &&
    navigator.doNotTrack !== "1" &&
    !(navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl;
  if (next === allowed && (!next || sdk)) {
    if (!next) clearAnalyticsJourney();
    return;
  }
  allowed = next;
  const current = ++generation;
  if (!allowed) {
    clearAnalyticsJourney();
    sdk?.reset();
    return;
  }
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || !/^phc_[A-Za-z0-9]+$/.test(key)) return;
  const { default: posthog } = await import("posthog-js/no-external");
  if (!allowed || generation !== current) return;
  if (!sdk) {
    sdk = posthog.init(key, {
      api_host: "https://eu.i.posthog.com",
      ui_host: "https://eu.posthog.com",
      defaults: "2026-05-30",
      persistence: "memory",
      disable_persistence: true,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      capture_dead_clicks: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      capture_performance: false,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      person_profiles: "never",
      respect_dnt: true,
      request_batching: false,
      opt_out_capturing_persistence_type: "cookie",
      opt_out_persistence_by_default: true,
      save_campaign_params: false,
      save_referrer: false,
      ip: false,
      disable_product_tours: true,
      disable_conversations: true,
      cross_subdomain_cookie: false,
      before_send: (event) => {
        if (!consentStillAllowed() || !event) return null;
        const safe = safeAnalyticsEvent(event.event, event.properties);
        if (!safe) return null;
        const distinct = getJourneyId();
        if (typeof distinct !== "string" || distinct.length > 100) return null;
        return {
          uuid: event.uuid,
          event: event.event,
          timestamp: event.timestamp,
          properties: {
            ...safe.properties,
            distinct_id: distinct,
            journey_version: "2",
            campaign:
              analyticsCampaign(sessionValue(campaignKey) ?? null) ?? "direct",
            $process_person_profile: false,
            $geoip_disable: true,
            token: key,
          },
        };
      },
    });
  }
  getJourneyId();
  const campaign = analyticsCampaign(
    new URLSearchParams(window.location.search).get("utm_source"),
  );
  if (campaign) sessionValue(campaignKey, campaign);
  window.dispatchEvent(new Event(analyticsReadyEvent));
}
export function track(name: string, properties: Record<string, unknown> = {}) {
  if (!consentStillAllowed() || !sdk) return false;
  const safe = safeAnalyticsEvent(
    name,
    name === "page_viewed"
      ? {
          ...properties,
          campaign: analyticsCampaign(sessionValue(campaignKey) ?? null),
          device: window.matchMedia("(max-width: 767px)").matches
            ? "compact"
            : "wide",
        }
      : properties,
  );
  if (safe) {
    getJourneyId();
    if (eligibleEngagement.has(name)) retainEngagement();
    sdk.capture(safe.event, safe.properties);
    return true;
  }
  return false;
}

export function useAnalyticsView(
  name: string,
  properties: Record<string, unknown>,
) {
  const signature = JSON.stringify(properties);
  const capture = useEffectEvent(() => track(name, properties));
  useEffect(() => {
    if (capture()) return;
    const onReady = () => {
      if (capture()) window.removeEventListener(analyticsReadyEvent, onReady);
    };
    window.addEventListener(analyticsReadyEvent, onReady);
    return () => window.removeEventListener(analyticsReadyEvent, onReady);
  }, [name, signature]);
}

export function trackCheckoutOpened(interval: string) {
  if (track("checkout_progress", { stage: "opened", interval }))
    sessionValue(checkoutKey, [Date.now(), interval].join(":"));
}

export function trackCheckoutReturn(completed: boolean) {
  if (!consentStillAllowed()) return;
  const previous = sessionValue(checkoutKey);
  if (!previous) return false;
  const [started, interval] = previous.split(":");
  const age = Date.now() - Number(started);
  if (
    age >= 0 &&
    age <= 35 * 60_000 &&
    !track("checkout_progress", {
      stage: completed ? "returned" : "returned_unfinished",
      interval,
    })
  )
    return false;
  sessionValue(checkoutKey, "");
  return true;
}
