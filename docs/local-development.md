# Develop VibeScroller locally

Mode: how-to. Use Node 24 and pnpm 12.3.4 from the repository root. The production application is `apps/starter`; its name reflects the CompanyNerve export. `apps/marketing` remains an inherited build target, while VibeScroller's public routes live in the application.

## Preview without provider accounts

```powershell
pnpm install --frozen-lockfile
node scripts/setup-preflight.mjs --demo
pnpm dev
```

Open `http://localhost:3001/demo`. The banner identifies synthetic data. Demo actions do not import media, call AI, charge a payment or write a repository. `/demo?uiState=empty`, `/demo?uiState=loading` and `/demo?uiState=error` expose fixture states. A fixture is not an integration test.

## Review the redesign with a private snapshot

On the Windows machine that holds the snapshot, run this command from the checkout.

```powershell
./scripts/start-local-snapshot.ps1
```

Open [local VibeScroll](http://localhost:3192/app). Home opens in Browse, matching production. The preview runs on loopback with no hosted credentials. The snapshot stays outside the checkout under `%LOCALAPPDATA%/VibeScroll/ui-snapshot`.

To refresh manually, leave one signed-in production workspace tab open in Chrome and run `Get-Content -Raw ./scripts/capture-local-snapshot.py | browser-harness`. A completed capture becomes active automatically. The old folder remains available, including any drafts saved alongside it.

The preview uses a point-in-time copy of the selected workspace's saved posts, insights, retained images, projects, proposals, runs and activity. It uses local text matching for Posts search. Likes are temporary for the dev server session. New proposal drafts are saved beside the snapshot and can be reopened locally. Provider actions, production account authentication, full knowledge indexing and live updates require a configured development backend.

## Configure your own development accounts

1. Run `pnpm convex:dev` and select a new project in your own account. Keep its generated ignored root `.env.local`. Never select the operator's production deployment for development.
2. In your own WorkOS environment enable Magic Auth and Google only. Set callback `http://localhost:3001/callback`, sign-out/homepage `http://localhost:3001` and initiate-login URL `http://localhost:3001/sign-in`. Provision your own Google consent client as described in [authentication](operations/authentication.md).
3. Put that environment's `WORKOS_CLIENT_ID` and server-only `WORKOS_API_KEY` in root `.env.local`. Set matching backend values through the provider's secret interface or stdin without printing values. Use `.env.example` for names, never production values.
4. Run `node scripts/setup-preflight.mjs`, then `pnpm setup:local`. Preflight reports names and pass/fail only; setup writes the ignored app environment and preserves its session secret. Restart `pnpm dev` after changes.
5. Sign in with an email code, verify Google separately and confirm sign-out. First sign-in creates a default workspace. Open Library; GitHub and billing are not required to save metadata. Follow [personal setup](PERSONAL-SETUP.md) before enabling analysis or storage.

The helper validates configuration, not provider authentication or commercial access. Do not turn verification flags on to silence an error. Keep `convex:dev` running for backend development and commit generated types without environment values.

## Optional billing tests

Ordinary library setup does not require live Stripe. The catalogue is Starter and Pro with weekly/monthly/annual intervals, not the exported starter's Free/Pro project limit. Use [the billing contract](BILLING-AND-TAX.md) and [provider setup](PROVIDER-SETUP.md) in your own dedicated sandbox. The VibeScroller webhook is `/stripe/v1/webhook` on the Convex HTTP origin. The inherited `/stripe/webhook` is a separate foundation route and does not verify V1 entitlements.

Use the sandbox catalogue utility only with its matching account and mode. Live-price creation and charges require separate operator authorization. Absent billing configuration shows unavailable checkout, never a simulated success. Personal use remains subject to core quotas, explicit reservations and its enabled funding route.

## Verify a change

Run `pnpm check`, `node scripts/audit-dependencies.mjs` and `git diff --check`. Check formatting on changed files. Record browser, integration and secret-scan evidence using [the contributor guide](CONTRIBUTING.md). A build does not prove account-backed setup, Android hardware, a billing settlement or a sandbox boundary.

The original template export command remains provenance, not VibeScroller's personal installer. Independent setup and upgrade evidence must come from clean checkouts and testers' own accounts.
