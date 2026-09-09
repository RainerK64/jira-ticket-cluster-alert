$ErrorActionPreference = 'Stop'

$repoUrl = 'https://github.com/RainerK64/jira-ticket-cluster-alert.git'
$branch = 'copilot/create-powershell-bootstrap-script'
$targetFolder = 'C:\temp\jira-ticket-cluster-alert'

function Fail {
    param([string]$Message)
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Ask {
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

        Write-Host 'Please enter a value.' -ForegroundColor Yellow
    }
}

Write-Host 'Jira Ticket Cluster Alert Setup'
Write-Host '-------------------------------'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail 'Git is not installed.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail 'Node.js and npm are not installed. Please install Node.js LTS first.'
}

Write-Host 'Stopping old Node.js processes...'
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $targetFolder) {
    $answer = Read-Host "Delete existing folder '$targetFolder' and download a fresh copy? (y/n)"
    if ($answer -notin @('y', 'Y')) {
        Write-Host 'Cancelled.'
        exit
    }

    Remove-Item $targetFolder -Recurse -Force
}

Write-Host "Downloading the fixed branch from GitHub..."
git clone --branch $branch $repoUrl $targetFolder
if ($LASTEXITCODE -ne 0) {
    Fail "Could not clone branch '$branch' from GitHub."
}

Set-Location $targetFolder

$packageJson = Get-Content '.\package.json' -Raw
if ($packageJson -match '"better-sqlite3"\s*:') {
    Fail "The downloaded branch is still outdated because package.json still contains better-sqlite3."
}

Write-Host 'Installing dependencies...'
npm install
if ($LASTEXITCODE -ne 0) {
    Fail 'npm install failed.'
}

Write-Host ''
Write-Host 'Enter your Jira settings.'
$jiraBaseUrl = Ask 'Jira Base URL (example: https://yourcompany.atlassian.net)'
$jiraEmail = Ask 'Jira Email'
$jiraApiToken = Ask 'Jira API Token'
$jiraProjectKey = Ask 'Jira Project Key' 'IT'

@"
JIRA_BASE_URL=$($jiraBaseUrl.TrimEnd('/'))
JIRA_EMAIL=$jiraEmail
JIRA_API_TOKEN=$jiraApiToken
JIRA_PROJECT_KEY=$jiraProjectKey
POLL_INTERVAL_SECONDS=60
SIMILARITY_THRESHOLD=0.72
ALERT_WINDOW_HOURS=24
APP_STATUS_PORT=3333
"@ | Set-Content '.\.env'

Write-Host ''
Write-Host 'Starting the app...'
npm run dev
