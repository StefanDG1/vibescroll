import {
  ArrowLeftRight,
  ChevronRight,
  CircleHelp,
  Cog,
  CreditCard,
  Gauge,
  Laptop,
  Plug,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountLink, AccountSection, AccountStatus } from "./account-layout";
import { AppTheme } from "./app-theme";
import { MotionPreference } from "./motion-preference";

export function AccountOverview({
  avatar,
  name,
  workspace,
  organizationId,
  role,
  privateLibrary,
  demo,
  go,
}: {
  avatar: ReactNode;
  name: string;
  workspace: string;
  organizationId: string;
  role?: string | null;
  privateLibrary?: boolean;
  demo?: boolean;
  go: (view: string) => void;
}) {
  const base = `/app/${organizationId}`;
  const identity = (
    <div className="account-identity-main">
      {avatar}
      <div>
        <h2>{name}</h2>
        <p>{workspace}</p>
      </div>
    </div>
  );
  return (
    <div className="account-content account-overview">
      {demo ? (
        <section className="account-identity">{identity}</section>
      ) : (
        <Link
          className="account-identity account-identity-link"
          href={`/account?workspace=${organizationId}`}
          prefetch={false}
        >
          {identity}
          <span className="account-identity-actions">
            {privateLibrary && <AccountStatus>Private library</AccountStatus>}
            <span className="account-manage-label">Manage profile</span>
            <ChevronRight
              className="account-chevron"
              size={18}
              aria-hidden="true"
            />
          </span>
        </Link>
      )}
      <div className="account-grid">
        {!demo && (
          <AccountSection title="Workspace">
            <div className="account-link-list">
              <AccountLink
                title="Switch workspace"
                icon={ArrowLeftRight}
                href={`/app/workspaces?from=${organizationId}`}
              />
              <AccountLink
                title="Workspace settings"
                description={
                  role === "owner"
                    ? "Name, shared library and exports"
                    : "Name and shared library"
                }
                icon={Cog}
                href={`${base}/settings`}
              />
              <AccountLink title="Team" icon={Users} href={`${base}/team`} />
              {(role === "owner" || role === "admin") && (
                <AccountLink
                  title="Audit log"
                  description="Recent workspace changes"
                  icon={ShieldCheck}
                  href={`${base}/audit`}
                />
              )}
            </div>
          </AccountSection>
        )}
        <AccountSection title="Tools and billing">
          <div className="account-link-list">
            <AccountLink
              title="Connections"
              description="Assistants, GitHub and provider keys"
              icon={Plug}
              onClick={() => go("connections")}
            />
            <AccountLink
              title="Computers"
              description="Pair a device for local tasks"
              icon={Laptop}
              onClick={() => go("runners")}
            />
            <AccountLink
              title="Usage"
              description="Credit balance and activity"
              icon={Gauge}
              onClick={() => go("usage")}
            />
            <AccountLink
              title="Billing"
              description="Subscription and payments"
              icon={CreditCard}
              onClick={() => go("billing")}
            />
          </div>
        </AccountSection>
        <AccountSection title="Appearance">
          <div className="account-preferences">
            <AppTheme control />
            <MotionPreference control />
          </div>
        </AccountSection>
        <AccountSection title="Privacy and support">
          <div className="account-link-list">
            <AccountLink
              title="Privacy"
              description="Data exports, cookies and notifications"
              icon={ShieldCheck}
              onClick={() => go("privacy")}
            />
            <AccountLink
              title="Help center"
              description="Guides and troubleshooting"
              icon={CircleHelp}
              href="/help"
            />
          </div>
        </AccountSection>
      </div>
    </div>
  );
}
