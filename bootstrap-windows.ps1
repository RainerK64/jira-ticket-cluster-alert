param(
    [string]$RepositoryUrl = 'https://github.com/RainerK64/jira-ticket-cluster-alert.git',
    [string]$Branch = 'main',
    [string]$TargetParent = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[ok] $Message" -ForegroundColor Green
}

function Fail-Script {
    param([string]$Message)
    Write-Host ""
    Write-Host "[error] $Message" -ForegroundColor Red
    exit 1
}

function Test-RequiredCommand {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail-Script "Required command '$Name' was not found. Please install it and run the script again."
    }
}

function Get-UniqueTargetPath {
    param(
        [string]$ParentPath,
        [string]$BaseName
    )

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $candidate = Join-Path $ParentPath "$BaseName-fresh-$timestamp"
    $suffix = 1

    while (Test-Path $candidate) {
        $candidate = Join-Path $ParentPath "$BaseName-fresh-$timestamp-$suffix"
        $suffix++
    }

    return $candidate
}

function Read-RequiredValue {
    param(
        [string]$Prompt,
        [string]$Default = ''
    )

    while ($true) {
        $label = if ($Default) { "$Prompt [$Default]" } else { $Prompt }
        $value = Read-Host $label

        if ([string]::IsNullOrWhiteSpace($value)) {
            $value = $Default
        }

        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }

        Write-Host "This value is required." -ForegroundColor Yellow
    }
}

function Read-OptionalValue {
    param(
        [string]$Prompt,
        [string]$Default
    )

    $value = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
    }

    return $value.Trim()
}

function Read-SecretValue {
    param([string]$Prompt)

    while ($true) {
        $secureValue = Read-Host $Prompt -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)

        try {
            $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        finally {
            if ($pointer -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($plainValue)) {
            return $plainValue.Trim()
        }

        Write-Host "This value is required." -ForegroundColor Yellow
    }
}

function Get-DefaultValue {
    param(
        [hashtable]$Values,
        [string]$Key,
        [string]$Fallback = ''
    )

    if ($Values.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace($Values[$Key])) {
        return [string]$Values[$Key]
    }

    return $Fallback
}

function Get-EnvDefaults {
    param([string]$EnvExamplePath)

    $defaults = @{}
    if (-not (Test-Path $EnvExamplePath)) {
        return $defaults
    }

    foreach ($line in Get-Content $EnvExamplePath) {
        if ($line -match '^\s*#' -or $line -notmatch '=') {
            continue
        }

        $parts = $line -split '=', 2
        $defaults[$parts[0].Trim()] = $parts[1].Trim()
    }

    return $defaults
}

Write-Host '============================================' -ForegroundColor White
Write-Host 'Jira Ticket Cluster Alert - Fresh Bootstrap' -ForegroundColor White
Write-Host '============================================' -ForegroundColor White

Test-RequiredCommand git
Test-RequiredCommand node
Test-RequiredCommand npm

$resolvedTargetParent = [System.IO.Path]::GetFullPath($TargetParent)
if (-not (Test-Path $resolvedTargetParent)) {
    New-Item -ItemType Directory -Path $resolvedTargetParent | Out-Null
}

$scriptDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot)
$targetPath = Get-UniqueTargetPath -ParentPath $resolvedTargetParent -BaseName 'jira-ticket-cluster-alert'

if ($targetPath -eq $scriptDirectory) {
    Fail-Script 'Refusing to reuse the current repository folder. Please choose a different target parent path.'
}

Write-Step 'Stopping running Node.js processes that may lock an older clone'
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $nodeProcesses | Stop-Process -Force
    Write-Ok 'Stopped running Node.js processes.'
} else {
    Write-Ok 'No running Node.js processes were found.'
}

Write-Step "Cloning a fresh copy into $targetPath"
git clone --depth 1 --branch $Branch $RepositoryUrl $targetPath
if ($LASTEXITCODE -ne 0) {
    Fail-Script 'git clone failed.'
}
Write-Ok 'Clone completed.'

$packageJsonPath = Join-Path $targetPath 'package.json'
if (-not (Test-Path $packageJsonPath)) {
    Fail-Script "The fresh clone is missing package.json at $packageJsonPath."
}

$packageJsonRaw = Get-Content -Path $packageJsonPath -Raw
if ($packageJsonRaw -match '"better-sqlite3"\s*:') {
    Fail-Script 'The freshly cloned package.json still references better-sqlite3. This clone is outdated, so npm install was not started. Please update the remote repository or branch and run the script again.'
}

Write-Ok 'Verified that package.json no longer references better-sqlite3.'

Push-Location $targetPath
try {
    Write-Step 'Installing npm dependencies'
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Fail-Script 'npm install failed.'
    }

    Write-Ok 'Dependencies installed.'

    $envExamplePath = Join-Path $targetPath '.env.example'
    $defaults = Get-EnvDefaults -EnvExamplePath $envExamplePath

    Write-Step 'Collecting Jira settings'
    $jiraBaseUrl = Read-RequiredValue -Prompt 'Jira base URL' -Default (Get-DefaultValue -Values $defaults -Key 'JIRA_BASE_URL')
    $jiraEmail = Read-RequiredValue -Prompt 'Jira email' -Default (Get-DefaultValue -Values $defaults -Key 'JIRA_EMAIL')
    $jiraApiToken = Read-SecretValue -Prompt 'Jira API token'
    $jiraProjectKey = Read-OptionalValue -Prompt 'Jira project key' -Default (Get-DefaultValue -Values $defaults -Key 'JIRA_PROJECT_KEY' -Fallback 'IT')
    $pollIntervalSeconds = Read-OptionalValue -Prompt 'Poll interval in seconds' -Default (Get-DefaultValue -Values $defaults -Key 'POLL_INTERVAL_SECONDS' -Fallback '60')
    $similarityThreshold = Read-OptionalValue -Prompt 'Similarity threshold' -Default (Get-DefaultValue -Values $defaults -Key 'SIMILARITY_THRESHOLD' -Fallback '0.72')
    $alertWindowHours = Read-OptionalValue -Prompt 'Alert window in hours' -Default (Get-DefaultValue -Values $defaults -Key 'ALERT_WINDOW_HOURS' -Fallback '24')
    $appStatusPort = Read-OptionalValue -Prompt 'Status page port' -Default (Get-DefaultValue -Values $defaults -Key 'APP_STATUS_PORT' -Fallback '3333')

    $envPath = Join-Path $targetPath '.env'
    @"
JIRA_BASE_URL=$($jiraBaseUrl.TrimEnd('/'))
JIRA_EMAIL=$jiraEmail
JIRA_API_TOKEN=$jiraApiToken
JIRA_PROJECT_KEY=$jiraProjectKey
POLL_INTERVAL_SECONDS=$pollIntervalSeconds
SIMILARITY_THRESHOLD=$similarityThreshold
ALERT_WINDOW_HOURS=$alertWindowHours
APP_STATUS_PORT=$appStatusPort
"@ | Set-Content -Path $envPath -Encoding utf8
    Write-Ok "Wrote .env to $envPath"

    Write-Step 'Starting the app with npm run dev'
    Write-Host "Fresh clone path: $targetPath" -ForegroundColor Yellow
    Write-Host 'Keep this PowerShell window open while the app is running.' -ForegroundColor Yellow
    & npm run dev
    if ($LASTEXITCODE -ne 0) {
        Fail-Script 'npm run dev failed.'
    }
}
finally {
    Pop-Location
}
