param(
  [Parameter(Mandatory = $true)][string]$Trust,
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$Signature,
  [Parameter(Mandatory = $true)][string]$PackageZip,
  [Parameter(Mandatory = $true)][string]$NodeZip,
  [switch]$Install,
  [switch]$RestartApproved
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This source has no production signature. Windows must trust the signed
# distribution before any archive, runtime or downloaded JavaScript is used.
$selfSignature = Get-AuthenticodeSignature -LiteralPath $PSCommandPath
if ($selfSignature.Status -ne 'Valid' -or $null -eq $selfSignature.SignerCertificate) {
  throw 'BOOTSTRAP_SIGNATURE_REQUIRED'
}
function Assert-PlainPath([string]$Path) {
  if (-not [IO.Path]::IsPathRooted($Path) -or $Path.Contains('"')) { throw 'BOOTSTRAP_ABSOLUTE_PATH_REQUIRED' }
  $cursor = [IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'BOOTSTRAP_REPARSE_REFUSED' }
    }
    $parent = [IO.Path]::GetDirectoryName($cursor)
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
}
function Read-Json([string]$Path, [long]$Maximum) {
  Assert-PlainPath $Path
  $item = Get-Item -LiteralPath $Path
  if ($item.PSIsContainer -or $item.Length -gt $Maximum) { throw 'BOOTSTRAP_FILE_INVALID' }
  return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}
function Copy-Bounded([string]$Source, [string]$Destination, [long]$Maximum) {
  Assert-PlainPath $Source
  $inputStream = [IO.File]::Open($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $outputStream = $null
  try {
    if ($inputStream.Length -gt $Maximum -or $inputStream.Length -le 0) { throw 'BOOTSTRAP_METADATA_SIZE_INVALID' }
    $outputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $buffer = New-Object byte[] 65536
    [long]$total = 0
    while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $total += $count
      if ($total -gt $Maximum) { throw 'BOOTSTRAP_METADATA_SIZE_INVALID' }
      $outputStream.Write($buffer, 0, $count)
    }
    $outputStream.Flush($true)
  } finally { if ($null -ne $outputStream) { $outputStream.Dispose() }; $inputStream.Dispose() }
}
function Assert-Bytes([string]$Path, [long]$Length, [string]$Hash) {
  Assert-PlainPath $Path
  $item = Get-Item -LiteralPath $Path
  if ($Length -le 0 -or $Length -gt 268435456 -or $Hash -cnotmatch '^[a-f0-9]{64}$' -or $item.PSIsContainer -or $item.Length -ne $Length -or (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Hash) { throw 'BOOTSTRAP_BYTES_MISMATCH' }
}
function Assert-Signer([string]$Path, [string]$Expected) {
  if ($Expected -cnotmatch '^[a-f0-9]{64}$') { throw 'BOOTSTRAP_SIGNER_REQUIRED' }
  $result = Get-AuthenticodeSignature -LiteralPath $Path
  if ($result.Status -ne 'Valid' -or $null -eq $result.SignerCertificate -or $result.SignerCertificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant() -cne $Expected) { throw 'BOOTSTRAP_SIGNER_MISMATCH' }
}
function Copy-ZipEntry($Entry, [string]$Destination, [long]$Maximum) {
  if ($Maximum -le 0 -or $Maximum -gt 268435456 -or $Entry.Length -ne $Maximum) { throw 'BOOTSTRAP_ZIP_SIZE_INVALID' }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Destination)) | Out-Null
  $inputStream = $Entry.Open()
  $outputStream = $null
  try {
    $outputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $buffer = New-Object byte[] 65536
    [long]$total = 0
    while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $total += $count
      if ($total -gt $Maximum) { throw 'BOOTSTRAP_ZIP_SIZE_INVALID' }
      $outputStream.Write($buffer, 0, $count)
    }
    if ($total -ne $Maximum) { throw 'BOOTSTRAP_ZIP_SIZE_INVALID' }
  } finally { if ($null -ne $outputStream) { $outputStream.Dispose() }; $inputStream.Dispose() }
}
foreach ($path in @($Trust, $Manifest, $Signature, $PackageZip, $NodeZip)) { Assert-PlainPath $path }
$authority = Read-Json $Trust 32768
Assert-Signer $PSCommandPath $authority.bootstrapAuthenticodeSha256
if ($authority.node.version -cne '24.22.1') { throw 'BOOTSTRAP_RUNTIME_VERSION_REQUIRED' }
Assert-Bytes $NodeZip $authority.node.archiveBytes $authority.node.archiveSha256
if (-not $env:LOCALAPPDATA -or -not [IO.Path]::IsPathRooted($env:LOCALAPPDATA)) { throw 'BOOTSTRAP_CURRENT_USER_REQUIRED' }
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'VibeScroll/Companion')).TrimEnd('\') + '\'
if ([IO.Path]::GetFullPath($Trust).StartsWith($installRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'BOOTSTRAP_TRUST_MUST_BE_EXTERNAL' }
$temporaryParent = Join-Path $env:LOCALAPPDATA 'VibeScroll/Bootstrap'
Assert-PlainPath $temporaryParent
$temporary = Join-Path $temporaryParent ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temporary) | Out-Null
try {
  # Snapshot bounded metadata into the current user's generated directory.
  # External input paths are never reopened after signature verification.
  $stagedManifest = Join-Path $temporary 'release.json'
  $stagedSignature = Join-Path $temporary 'release.sig'
  Copy-Bounded $Manifest $stagedManifest 2097152
  Copy-Bounded $Signature $stagedSignature 64
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $runtime = [IO.Compression.ZipFile]::OpenRead($NodeZip)
  $nodePath = Join-Path $temporary 'node.exe'
  try {
    $entries = @($runtime.Entries | Where-Object { $_.FullName -ceq 'node-v24.22.1-win-x64/node.exe' })
    if ($entries.Count -ne 1) { throw 'BOOTSTRAP_RUNTIME_ENTRY_REQUIRED' }
    Copy-ZipEntry $entries[0] $nodePath $authority.node.executableBytes
  } finally { $runtime.Dispose() }
  Assert-Bytes $nodePath $authority.node.executableBytes $authority.node.executableSha256
  Assert-Signer $nodePath $authority.node.authenticodeSha256
  $releaseTrustPath = Join-Path $temporary 'release-trust.json'
  $releaseTrustJson = $authority.releaseTrust | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText($releaseTrustPath, $releaseTrustJson, [Text.UTF8Encoding]::new($false))
  $verifyPath = Join-Path $temporary 'verify-release.mjs'
  # This verifier is code inside the signed bootstrap, never a package member.
  @'
import {readFileSync} from 'node:fs';
import {createPublicKey,verify} from 'node:crypto';
const [trustPath,manifestPath,signaturePath]=process.argv.slice(2);
const raw=readFileSync(manifestPath), signature=readFileSync(signaturePath);
const trust=JSON.parse(readFileSync(trustPath,'utf8').replace(/^\uFEFF/,''));
const key=createPublicKey(trust.publicKeyPem);
if(raw.length>2097152||signature.length!==64||key.asymmetricKeyType!=='ed25519'||!verify(null,raw,key,signature))process.exit(9);
const release=JSON.parse(raw);
if(trust.schemaVersion!==1||!Number.isSafeInteger(trust.minimumSequence)||trust.minimumSequence<1||release.schemaVersion!==1||release.platform!=='win32-x64'||!Number.isSafeInteger(release.sequence)||release.sequence<trust.minimumSequence)process.exit(10);
'@ | Set-Content -LiteralPath $verifyPath -Encoding UTF8
  # NODE_OPTIONS/NODE_PATH could inject unverified code before the verifier.
  $oldOptions = $env:NODE_OPTIONS
  $oldNodePath = $env:NODE_PATH
  try {
    $env:NODE_OPTIONS = '--no-global-search-paths --no-addons'
    Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
    & $nodePath $verifyPath $releaseTrustPath $stagedManifest $stagedSignature
    if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_RELEASE_SIGNATURE_INVALID' }
    $release = Read-Json $stagedManifest 2097152
    if ($release.node.version -cne '24.22.1' -or $release.node.archive.sha256 -cne $authority.node.archiveSha256 -or $release.node.archive.bytes -ne $authority.node.archiveBytes -or $release.node.executableSha256 -cne $authority.node.executableSha256 -or $release.node.executableBytes -ne $authority.node.executableBytes -or $release.node.authenticodeSha256 -cne $authority.node.authenticodeSha256 -or $release.package.distribution -cne 'runtime') { throw 'BOOTSTRAP_RUNTIME_BINDING_MISMATCH' }
    Assert-Bytes $PackageZip $release.package.archive.bytes $release.package.archive.sha256
    if ($release.package.files.Count -lt 1 -or $release.package.files.Count -gt 12000) { throw 'BOOTSTRAP_INVENTORY_INVALID' }
    $package = [IO.Compression.ZipFile]::OpenRead($PackageZip)
    $app = Join-Path $temporary 'app'
    try {
      $names = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
      [long]$expanded = 0
      foreach ($file in $release.package.files) {
        $name = [string]$file.path
        if ($name.Length -gt 240 -or $name -cnotmatch '^[A-Za-z0-9._/-]+$' -or $name.StartsWith('/') -or $name.EndsWith('/') -or -not $names.Add($name)) { throw 'BOOTSTRAP_PACKAGE_PATH_INVALID' }
        foreach ($part in $name.Split('/')) {
          if (-not $part -or $part -eq '.' -or $part -eq '..' -or $part.EndsWith('.') -or $part -match '^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)') { throw 'BOOTSTRAP_PACKAGE_PATH_INVALID' }
        }
        $expanded += [long]$file.bytes
        if ($expanded -gt 805306368) { throw 'BOOTSTRAP_PACKAGE_TOO_LARGE' }
        $matches = @($package.Entries | Where-Object { $_.FullName -ceq $name })
        if ($matches.Count -ne 1 -or (($matches[0].ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'BOOTSTRAP_ZIP_ENTRY_INVALID' }
        $destination = Join-Path $app $name
        Copy-ZipEntry $matches[0] $destination $file.bytes
        Assert-Bytes $destination $file.bytes $file.sha256
      }
    } finally { $package.Dispose() }
    $installer = Join-Path $app 'scripts/install-companion.mjs'
    if (-not $names.Contains('scripts/install-companion.mjs')) { throw 'BOOTSTRAP_INSTALLER_ENTRY_REQUIRED' }
    & $nodePath $installer 'preflight' $releaseTrustPath $stagedManifest $stagedSignature
    if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_PREFLIGHT_REFUSED' }
    if ($Install) {
      if (-not $RestartApproved) { throw 'BOOTSTRAP_RESTART_APPROVAL_REQUIRED' }
      & $nodePath $installer 'stage-offline' $releaseTrustPath $stagedManifest $stagedSignature $PackageZip $NodeZip '--restart-approved'
      if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_STAGE_REFUSED' }
      # Let the core verify/derive the exact release id from signed raw bytes.
      $rawHash = (Get-FileHash -LiteralPath $stagedManifest -Algorithm SHA256).Hash.ToLowerInvariant().Substring(0, 24)
      $releaseId = [string]$release.sequence + '-' + $rawHash
      & $nodePath $installer 'activate' $releaseTrustPath $releaseId '--restart-approved'
      if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_ACTIVATION_REFUSED' }
    }
  } finally {
    $env:NODE_OPTIONS = $oldOptions
    $env:NODE_PATH = $oldNodePath
  }
} finally {
  # Delete only this generated child. User config, trust and archives are external.
  Assert-PlainPath $temporary
  $resolvedTemporary = [IO.Path]::GetFullPath($temporary)
  $resolvedParent = [IO.Path]::GetFullPath($temporaryParent).TrimEnd('\') + '\'
  if (-not $resolvedTemporary.StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedTemporary) -cnotmatch '^[a-f0-9]{32}$') { throw 'BOOTSTRAP_CLEANUP_PATH_REFUSED' }
  Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
}
