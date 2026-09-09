[CmdletBinding()]
param(
  [string]$RepoUrl = "https://github.com/RainerK64/jira-ticket-cluster-alert.git",
  [string]$ParentDirectory = (Join-Path $env:TEMP "jira-ticket-cluster-alert-bootstrap"),
  [switch]$SkipDependencyCheck
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Prompt-Required {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )

  while ($true) {
    if ([string]::IsNullOrWhiteSpace($Default)) {
      $value = Read-Host $Prompt
    } else {
      $value = Read-Host "$Prompt [$Default]"
      if ([string]::IsNullOrWhiteSpace($value)) {
        $value = $Default
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }

    Write-Host "Value is required. Please try again." -ForegroundColor Yellow
  }
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

Write-Step "Checking prerequisites"
Assert-Command -Name git
Assert-Command -Name npm

Write-Step "Stopping running Node.js processes that could lock files"
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcs) {
  $nodeProcs | Stop-Process -Force
  Write-Host "Stopped $($nodeProcs.Count) Node.js process(es)." -ForegroundColor Green
} else {
  Write-Host "No running Node.js processes found." -ForegroundColor DarkGray
}

Write-Step "Preparing a fresh target folder"
New-Item -ItemType Directory -Path $ParentDirectory -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$targetFolder = Join-Path $ParentDirectory "jira-ticket-cluster-alert-$timestamp"
if (Test-Path $targetFolder) {
  throw "Target folder already exists: $targetFolder"
}

Write-Step "Cloning repository into fresh folder"
& git clone --depth 1 $RepoUrl $targetFolder
if ($LASTEXITCODE -ne 0) {
  throw "git clone failed."
}

$packageJsonPath = Join-Path $targetFolder "package.json"
if (-not (Test-Path $packageJsonPath)) {
  throw "Clone looks incomplete: package.json was not found at $packageJsonPath"
}

Write-Step "Verifying this clone uses the JSON-storage version"
$packageRaw = Get-Content -Path $packageJsonPath -Raw
$packageJson = $packageRaw | ConvertFrom-Json

$allDeps = @{}
foreach ($group in @("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")) {
  if ($packageJson.PSObject.Properties.Name -contains $group) {
    $depGroup = $packageJson.$group
    if ($null -ne $depGroup) {
      foreach ($dep in $depGroup.PSObject.Properties) {
        $allDeps[$dep.Name] = $dep.Value
      }
    }
  }
}

$hasBetterSqlite = $allDeps.ContainsKey("better-sqlite3") -or ($packageRaw -match '"better-sqlite3"')
if ($hasBetterSqlite) {
  $message = @"
Outdated repository detected: package.json still references 'better-sqlite3'.
This bootstrap script expects the updated JSON-storage version.

What to do next:
- Ensure the remote repository contains the commit that removed better-sqlite3.
- Re-run this script after the remote/default branch is updated.
- If you intentionally want to continue anyway, run again with -SkipDependencyCheck.

Cloned folder kept for inspection:
$targetFolder
"@

  if ($SkipDependencyCheck) {
    Write-Host $message -ForegroundColor Yellow
  } else {
    throw $message
  }
} else {
  Write-Host "Dependency check passed (better-sqlite3 not found)." -ForegroundColor Green
}

Push-Location $targetFolder
try {
  Write-Step "Installing npm dependencies"
  & npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
  }

  Write-Step "Collecting Jira settings"
  $jiraBaseUrl = Prompt-Required -Prompt "JIRA_BASE_URL (e.g. https://your-domain.atlassian.net)"
  $jiraEmail = Prompt-Required -Prompt "JIRA_EMAIL"
  $jiraToken = Prompt-Required -Prompt "JIRA_API_TOKEN"
  $jiraProjectKey = Prompt-Required -Prompt "JIRA_PROJECT_KEY" -Default "IT"
  $pollInterval = Prompt-Required -Prompt "POLL_INTERVAL_SECONDS" -Default "60"
  $similarityThreshold = Prompt-Required -Prompt "SIMILARITY_THRESHOLD" -Default "0.72"
  $alertWindowHours = Prompt-Required -Prompt "ALERT_WINDOW_HOURS" -Default "24"
  $statusPort = Prompt-Required -Prompt "APP_STATUS_PORT" -Default "3333"

  $envPath = Join-Path $targetFolder ".env"
  if (Test-Path $envPath) {
    $overwrite = Read-Host ".env already exists in the new clone. Overwrite it? (y/N)"
    if ($overwrite -notin @("y", "Y", "yes", "YES")) {
      throw "Setup cancelled by user before writing .env"
    }
  }

  Write-Step "Writing .env"
  @(
    "JIRA_BASE_URL=$jiraBaseUrl"
    "JIRA_EMAIL=$jiraEmail"
    "JIRA_API_TOKEN=$jiraToken"
    "JIRA_PROJECT_KEY=$jiraProjectKey"
    "POLL_INTERVAL_SECONDS=$pollInterval"
    "SIMILARITY_THRESHOLD=$similarityThreshold"
    "ALERT_WINDOW_HOURS=$alertWindowHours"
    "APP_STATUS_PORT=$statusPort"
  ) | Set-Content -Path $envPath -Encoding UTF8

  Write-Host "Setup complete in: $targetFolder" -ForegroundColor Green
  Write-Step "Starting app (npm run dev)"
  & npm run dev
} finally {
  Pop-Location
}
