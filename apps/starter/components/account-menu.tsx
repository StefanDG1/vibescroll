"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
export type AccountProfile = {
  firstName?: string | null;
  name?: string;
  pictureUrl?: string | null;
};
function ProfileAvatar({ profile }: { profile?: AccountProfile }) {
  const [failed, setFailed] = useState(false);
  const name = profile?.firstName || profile?.name || "User";
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "U";
  const picture = profile?.pictureUrl?.startsWith("https://")
    ? profile.pictureUrl
    : null;
  return (
    <span className="account-avatar" aria-hidden="true">
      {picture && !failed ? (
        <Image
          src={picture}
          alt=""
          width={28}
          height={28}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
import {
  UserRound,
  Settings2,
  CreditCard,
  Laptop,
  ShieldCheck,
  Cookie,
  LogOut,
  ChevronDown,
  ExternalLink,
  CircleHelp,
} from "lucide-react";
import { openCookiePreferences } from "./consent";
export function AccountMenu({
  go,
  demo = false,
  mobile = false,
  active = false,
  profile,
}: {
  go: (view: string) => void;
  demo?: boolean;
  mobile?: boolean;
  active?: boolean;
  profile?: AccountProfile;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={`account-trigger ${mobile ? "mobile-account-trigger" : ""} ${active ? "active" : ""}`}
        aria-label="Account menu"
        aria-current={active ? "page" : undefined}
      >
        <ProfileAvatar
          key={profile?.pictureUrl ?? profile?.firstName ?? "default"}
          profile={profile ?? (demo ? { firstName: "Demo" } : undefined)}
        />
        <span>Account</span>
        {!mobile && <ChevronDown size={15} />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="account-menu"
          side={mobile ? "top" : "bottom"}
          sideOffset={8}
          align="end"
          collisionPadding={12}
        >
          <Menu.Label className="account-identity">
            {profile?.firstName ||
              profile?.name ||
              (demo ? "Demo account" : "Your account")}
          </Menu.Label>
          <Menu.Item className="menu-item" onSelect={() => go("menu")}>
            <UserRound size={17} />
            Account and appearance
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={() => go("usage")}>
            <Settings2 size={17} />
            Usage
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={() => go("billing")}>
            <CreditCard size={17} />
            Billing
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={() => go("runners")}>
            <Laptop size={17} />
            Computers
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={() => go("privacy")}>
            <ShieldCheck size={17} />
            Privacy
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={openCookiePreferences}>
            <Cookie size={17} />
            Cookie preferences
          </Menu.Item>
          <Menu.Separator className="menu-separator" />
          <Menu.Item asChild className="menu-item">
            <Link href="/help" target="_blank" rel="noopener noreferrer">
              <CircleHelp size={17} />
              Help
            </Link>
          </Menu.Item>
          <Menu.Label
            className="version-label"
            title={process.env.NEXT_PUBLIC_APP_COMMIT}
          >
            Alpha · {process.env.NEXT_PUBLIC_APP_VERSION}
          </Menu.Label>
          <Menu.Item asChild className="menu-item">
            <Link href={demo ? "/app" : "/account"}>
              <LogOut size={17} />
              {demo ? "Open your library" : "Account & sign out"}
            </Link>
          </Menu.Item>
          <Menu.Item asChild className="menu-item">
            <Link href="/">
              <ExternalLink size={17} />
              Website
            </Link>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
