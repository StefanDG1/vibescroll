$ErrorActionPreference = "Stop"
$root = Join-Path $env:LOCALAPPDATA 'VibeScroll/ui-snapshot'
if (!(Test-Path -LiteralPath (Join-Path $root 'current.txt'))) {
  throw 'Capture a private VibeScroll snapshot before starting this preview.'
}
$previewSettings = @{
  VIBESCROLL_LOCAL_SNAPSHOT = '1'
  NEXT_TELEMETRY_DISABLED = '1'
  NEXT_PUBLIC_POSTHOG_KEY = ''
  NEXT_PUBLIC_CONVEX_URL = ''
  WORKOS_CLIENT_ID = ''
  WORKOS_API_KEY = ''
  WORKOS_COOKIE_PASSWORD = ''
  APP_URL = 'http://localhost:3192'
}
$previousSettings = @{}
try {
  foreach ($name in $previewSettings.Keys) {
    $previousSettings[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $previewSettings[$name], 'Process')
  }
  pnpm --filter @companynerve/starter exec next dev --hostname 127.0.0.1 --port 3192
  exit $LASTEXITCODE
} finally {
  foreach ($name in $previousSettings.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previousSettings[$name], 'Process')
  }
}
