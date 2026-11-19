"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

export function PublicCta({
  cta,
  page,
  ...props
}: Omit<ComponentProps<typeof Link>, "onClick"> & {
  cta: "start_setup" | "try_example" | "see_pricing" | "view_pro";
  page: "home" | "pricing" | "example";
}) {
  return (
    <Link
      {...props}
      onClick={() => track("public_cta_clicked", { cta, page })}
    />
  );
}
