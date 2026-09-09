$ErrorActionPreference = 'Stop'

$repoUrl = 'https://github.com/RainerK64/jira-ticket-cluster-alert.git'
$branch = 'copilot/create-powershell-bootstrap-script'
$targetFolder = 'C:\temp\jira-ticket-cluster-alert'

function Stop-WithMessage {
    param([string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    exit 1
}

function Ask-Required {
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

        Write-Host 'This value is required.' -ForegroundColor Yellow
    }
}

function Ask-Optional {
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

Write-Host '============================================'
Write-Host 'Jira Ticket Cluster Alert Setup'
Write-Host '============================================'
Write-Host "Repo:   $repoUrl"
Write-Host "Branch: $branch"
Write-Host "Folder: $targetFolder"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Stop-WithMessage "Git is not installed. Install Git first, then run this script again."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Stop-WithMessage "Node.js and npm are not installed. Install Node.js LTS first, then run this script again."
}

Write-Host ''
Write-Host 'Stopping Node.js...'
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $targetFolder) {
    Write-Host ''
    Write-Host "Folder already exists: $targetFolder" -ForegroundColor Yellow
    $answer = Read-Host 'Delete it and download a fresh copy? (y/n)'
    if ($answer -notin @('y', 'Y')) {
        Write-Host 'Cancelled.'
        exit
    }

    Remove-Item $targetFolder -Recurse -Force
}

Write-Host ''
Write-Host 'Cloning repository...'
git clone --branch $branch $repoUrl $targetFolder
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "Clone failed. Make sure the branch '$branch' exists on GitHub and try again."
}

Set-Location $targetFolder

Write-Host 'Checking package.json...'
$packageJson = Get-Content '.\package.json' -Raw
if ($packageJson -match '"better-sqlite3"\s*:') {
    Stop-WithMessage "This clone is still outdated because it contains better-sqlite3. The branch '$branch' on GitHub still needs to be updated."
}

Write-Host 'Installing dependencies...'
npm install
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage 'npm install failed.'
}

Write-Host ''
Write-Host 'Enter your Jira settings:'
$jiraBaseUrl = Ask-Required 'Jira Base URL (example: https://yourcompany.atlassian.net)'
$jiraEmail = Ask-Required 'Jira Email'
$jiraApiToken = Ask-Required 'Jira API Token'
$jiraProjectKey = Ask-Optional 'Jira Project Key' 'IT'

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
Write-Host 'Starting app...'
npm run dev
