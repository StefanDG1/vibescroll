"use client";

import { clearAnalyticsJourney } from "@/lib/analytics";
import type { ComponentProps } from "react";

export function AnalyticsLogout(
  props: Omit<ComponentProps<"form">, "onSubmit">,
) {
  return <form {...props} onSubmit={() => clearAnalyticsJourney()} />;
}
