"use client";
import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "react";
import { ProposalArtifactCore } from "./proposal-artifact-core";

/** Website navigation and images stay outside the shared plan presentation. */
export function ProposalArtifact(
  props: ComponentProps<typeof ProposalArtifactCore>,
) {
  return (
    <ProposalArtifactCore
      {...props}
      renderBrandIcon={(size) => (
        <Image src="/icon.svg" alt="" width={size} height={size} />
      )}
      renderLink={(href, children) => (
        <Link prefetch={false} href={href}>
          {children}
        </Link>
      )}
    />
  );
}
