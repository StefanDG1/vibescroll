param(
  [string]$Config,
  [switch]$Install,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$runnerRoot = Split-Path -Parent $PSScriptRoot
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'VibeScroll Assistant.lnk'
$shortcutDescription = 'VibeScroll local assistant runner'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $shortcutPath) {
  $existingShortcut = $shell.CreateShortcut($shortcutPath)
  if ($existingShortcut.Description -ne $shortcutDescription) {
    throw 'A different startup entry already uses this name.'
  }
}
if ($Remove) {
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath
  }
  Write-Output 'VibeScroll automatic startup removed. Turn off automatic analysis in Connections to stop new work.'
  exit 0
}
$configPath = (Resolve-Path -LiteralPath $Config).Path
if ($configPath.Contains('"') -or $PSCommandPath.Contains('"') -or (Get-Item -LiteralPath $configPath).Length -gt 10000) {
  throw 'Use an absolute local runner configuration path.'
}
$nodePath = (Get-Command node -CommandType Application).Source
if ($Install) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $shortcut.Arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File "' + $PSCommandPath + '" -Config "' + $configPath + '"'
  $shortcut.WorkingDirectory = $runnerRoot
  $shortcut.Description = $shortcutDescription
  $shortcut.WindowStyle = 7
  $shortcut.Save()
  Write-Output 'VibeScroll will start in the background when this Windows user signs in. Existing analysis preferences still control all work.'
  exit 0
}

# One supervisor per Windows session. It observes an existing manual runner
# rather than starting another worker against the same saved login.
$mutex = New-Object Threading.Mutex($false, 'Local\VibeScrollAssistantSupervisor')
$acquired = $false
try {
  try { $acquired = $mutex.WaitOne(0) }
  catch [Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }
  while ($true) {
    $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
      $_.CommandLine -match 'assistant-runner\.mjs' -and
      $_.CommandLine.Replace('\', '/') -match [regex]::Escape($configPath.Replace('\', '/'))
    }
    if (-not $running) {
      Start-Process -FilePath $nodePath -ArgumentList @(
        'packages/runner/assistant-runner.mjs', ('"' + $configPath + '"')
      ) -WorkingDirectory $runnerRoot -WindowStyle Hidden -Wait `
        -RedirectStandardOutput (Join-Path $runnerRoot 'private/assistant-background.out.log') `
        -RedirectStandardError (Join-Path $runnerRoot 'private/assistant-background.err.log')
    }
    # Network or Docker outages may stop the controller. Retry connection after
    # five minutes; failed source jobs still require explicit review/retry.
    Start-Sleep -Seconds 300
  }
}
finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
