param(
  [string]$InstallDir = "$env:LOCALAPPDATA\TheArchitech"
)

$ErrorActionPreference = "Stop"
$Repository = "CharisChakim/the-architech"
$ArchiveUrl = if ($env:ARCHITECH_ARCHIVE_URL) { $env:ARCHITECH_ARCHIVE_URL } else { "https://github.com/$Repository/archive/refs/heads/main.zip" }

foreach ($CommandName in @("node", "npm")) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Missing requirement: $CommandName"
  }
}

$NodeVersion = (& node -p 'process.versions.node').Trim().Split(".")
$NodeMajor = [int]$NodeVersion[0]
$NodeMinor = [int]$NodeVersion[1]
if (($NodeMajor -lt 22) -or (($NodeMajor -eq 22) -and ($NodeMinor -lt 14))) {
  throw "Node.js 22.14 or newer is required. Current version: $(& node --version)"
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("the-architech-" + [guid]::NewGuid())
$ArchivePath = Join-Path $TempDir "source.zip"

try {
  New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
  Write-Host "Downloading The Architech..."
  Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath
  Expand-Archive -Path $ArchivePath -DestinationPath $TempDir -Force
  $SourceDir = Get-ChildItem -Path $TempDir -Directory | Where-Object { $_.Name -like "the-architech-*" } | Select-Object -First 1
  if (-not $SourceDir) {
    throw "Downloaded archive did not contain the application."
  }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  # Copying over the existing directory keeps data/ and .env during updates.
  Get-ChildItem -Path $SourceDir.FullName -Force | Copy-Item -Destination $InstallDir -Recurse -Force

  Write-Host "Installing dependencies and building production files..."
  Push-Location $InstallDir
  try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
  }
  finally {
    Pop-Location
  }

  $Launcher = Join-Path $InstallDir "start-the-architech.cmd"
  "@echo off`r`ncd /d `"%~dp0`"`r`nnpm start`r`n" | Set-Content -Path $Launcher -Encoding Ascii

  Write-Host ""
  Write-Host "Installed in: $InstallDir"
  Write-Host "Start with: $Launcher"
  Write-Host "Then open http://localhost:3000"
}
finally {
  if (Test-Path $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force
  }
}
