$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoUrl = 'https://github.com/RainerK64/jira-ticket-cluster-alert.git'
$branch = 'main'
$targetFolder = 'C:\temp\jira-ticket-cluster-alert'

function Fail {
    param([string]$Message)
    [System.Windows.Forms.MessageBox]::Show($Message, 'Jira Ticket Cluster Alert Setup', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    throw $Message
}

function Show-Info {
    param([string]$Message)
    [System.Windows.Forms.MessageBox]::Show($Message, 'Jira Ticket Cluster Alert Setup', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}

function Confirm-Action {
    param([string]$Message)

    return [System.Windows.Forms.MessageBox]::Show($Message, 'Jira Ticket Cluster Alert Setup', [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question) -eq [System.Windows.Forms.DialogResult]::Yes
}

function Stop-NodeProcessesForPath {
    param([string]$PathToMatch)

    if (-not (Test-Path $PathToMatch)) {
        return
    }

    $normalizedPath = $PathToMatch.ToLowerInvariant()
    $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue

    foreach ($process in $nodeProcesses) {
        $commandLine = ($process.CommandLine ?? '').ToLowerInvariant()
        if ($commandLine -and $commandLine.Contains($normalizedPath)) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

function New-Field {
    param(
        [System.Windows.Forms.Form]$Form,
        [string]$LabelText,
        [int]$Top,
        [string]$DefaultValue = '',
        [bool]$IsPassword = $false
    )

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $LabelText
    $label.Left = 20
    $label.Top = $Top
    $label.Width = 160
    $Form.Controls.Add($label)

    $textbox = New-Object System.Windows.Forms.TextBox
    $textbox.Left = 190
    $textbox.Top = $Top - 3
    $textbox.Width = 270
    $textbox.Text = $DefaultValue
    if ($IsPassword) {
        $textbox.UseSystemPasswordChar = $true
    }

    $Form.Controls.Add($textbox)
    return $textbox
}

function Show-SetupForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Jira Ticket Cluster Alert Setup'
    $form.StartPosition = 'CenterScreen'
    $form.Size = New-Object System.Drawing.Size(500, 380)
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true

    $intro = New-Object System.Windows.Forms.Label
    $intro.Text = 'Enter your Jira settings. The script will then download, install, and start the app.'
    $intro.Left = 20
    $intro.Top = 15
    $intro.Width = 440
    $intro.Height = 35
    $form.Controls.Add($intro)

    $baseUrlBox = New-Field -Form $form -LabelText 'Jira Base URL' -Top 60 -DefaultValue 'https://your-domain.atlassian.net'
    $emailBox = New-Field -Form $form -LabelText 'Jira Email' -Top 100
    $tokenBox = New-Field -Form $form -LabelText 'Jira API Token' -Top 140 -IsPassword $true
    $projectKeyBox = New-Field -Form $form -LabelText 'Jira Project Key' -Top 180 -DefaultValue 'IT'
    $branchBox = New-Field -Form $form -LabelText 'Git Branch' -Top 220 -DefaultValue $branch
    $targetFolderBox = New-Field -Form $form -LabelText 'Install Folder' -Top 260 -DefaultValue $targetFolder

    $okButton = New-Object System.Windows.Forms.Button
    $okButton.Text = 'Start Setup'
    $okButton.Left = 270
    $okButton.Top = 300
    $okButton.Width = 90
    $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($okButton)

    $cancelButton = New-Object System.Windows.Forms.Button
    $cancelButton.Text = 'Cancel'
    $cancelButton.Left = 370
    $cancelButton.Top = 300
    $cancelButton.Width = 90
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancelButton)

    $form.AcceptButton = $okButton
    $form.CancelButton = $cancelButton

    if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        return $null
    }

    return @{
        JiraBaseUrl = $baseUrlBox.Text.Trim()
        JiraEmail = $emailBox.Text.Trim()
        JiraApiToken = $tokenBox.Text
        JiraProjectKey = $projectKeyBox.Text.Trim()
        Branch = $branchBox.Text.Trim()
        TargetFolder = $targetFolderBox.Text.Trim()
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail 'Git is not installed. Please install Git first.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail 'Node.js and npm are not installed. Please install Node.js LTS first.'
}

$settings = Show-SetupForm
if ($null -eq $settings) {
    exit
}

if ([string]::IsNullOrWhiteSpace($settings.JiraBaseUrl) -or
    [string]::IsNullOrWhiteSpace($settings.JiraEmail) -or
    [string]::IsNullOrWhiteSpace($settings.JiraApiToken) -or
    [string]::IsNullOrWhiteSpace($settings.JiraProjectKey) -or
    [string]::IsNullOrWhiteSpace($settings.Branch) -or
    [string]::IsNullOrWhiteSpace($settings.TargetFolder)) {
    Fail 'Please fill in Jira Base URL, Jira Email, Jira API Token, Jira Project Key, Git Branch, and Install Folder.'
}

$branch = $settings.Branch
$targetFolder = $settings.TargetFolder
$parentFolder = Split-Path -Parent $targetFolder
if (-not (Test-Path $parentFolder)) {
    New-Item -ItemType Directory -Path $parentFolder -Force | Out-Null
}

if (Test-Path $targetFolder) {
    if (-not (Confirm-Action "Delete existing folder '$targetFolder' and download a fresh copy?")) {
        exit
    }

    Stop-NodeProcessesForPath $targetFolder
    Remove-Item $targetFolder -Recurse -Force
}

Write-Host "Downloading branch '$branch' from GitHub..."
git clone --branch $branch $repoUrl $targetFolder
if ($LASTEXITCODE -ne 0) {
    Fail "Could not clone branch '$branch' from GitHub."
}

Set-Location $targetFolder

$packageJson = Get-Content '.\package.json' -Raw | ConvertFrom-Json
$allDependencies = @($packageJson.dependencies.PSObject.Properties.Name) + @($packageJson.devDependencies.PSObject.Properties.Name)
if ($allDependencies -contains 'better-sqlite3') {
    Fail "The downloaded branch '$branch' is still outdated because package.json still contains better-sqlite3."
}

@"
JIRA_BASE_URL=$($settings.JiraBaseUrl.TrimEnd('/'))
JIRA_EMAIL=$($settings.JiraEmail)
JIRA_API_TOKEN=$($settings.JiraApiToken)
JIRA_PROJECT_KEY=$($settings.JiraProjectKey)
POLL_INTERVAL_SECONDS=60
SIMILARITY_THRESHOLD=0.72
WORK_WEEK_TIMEZONE_OFFSET_HOURS=2
APP_STATUS_PORT=3333
"@ | Set-Content '.\.env'

Write-Host 'Installing dependencies...'
npm install
if ($LASTEXITCODE -ne 0) {
    Fail 'npm install failed.'
}

Show-Info "Setup finished. The app will now start from:`n$targetFolder"
Write-Host 'Starting the app...'
npm run dev
