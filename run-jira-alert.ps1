$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoUrl = 'https://github.com/RainerK64/jira-ticket-cluster-alert.git'
$branch = 'main'
$targetFolder = 'C:\temp\jira-ticket-cluster-alert'
$settingsDir = Join-Path $env:LOCALAPPDATA 'JiraTicketClusterAlert'
$settingsFile = Join-Path $settingsDir 'setup-settings.xml'

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

function Get-ValueOrDefault {
    param(
        $Value,
        [string]$DefaultValue = ''
    )

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $DefaultValue
    }

    return [string]$Value
}

function Get-SavedSetupSettings {
    if (-not (Test-Path $settingsFile)) {
        return $null
    }

    try {
        $saved = Import-Clixml -Path $settingsFile
        $token = ''
        if ($saved.JiraApiToken) {
            $secureToken = ConvertTo-SecureString $saved.JiraApiToken
            $token = [System.Net.NetworkCredential]::new('', $secureToken).Password
        }

        return @{
            JiraBaseUrl = [string]$saved.JiraBaseUrl
            JiraEmail = [string]$saved.JiraEmail
            JiraApiToken = $token
            JiraProjectKey = [string]$saved.JiraProjectKey
            Branch = [string]$saved.Branch
            TargetFolder = [string]$saved.TargetFolder
        }
    } catch {
        Show-Info 'Saved setup details could not be loaded. Please enter them again.'
        return $null
    }
}

function Save-SetupSettings {
    param([hashtable]$Settings)

    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null

    $token = ConvertTo-SecureString $Settings.JiraApiToken -AsPlainText -Force | ConvertFrom-SecureString
    [pscustomobject]@{
        JiraBaseUrl = $Settings.JiraBaseUrl
        JiraEmail = $Settings.JiraEmail
        JiraApiToken = $token
        JiraProjectKey = $Settings.JiraProjectKey
        Branch = $Settings.Branch
        TargetFolder = $Settings.TargetFolder
    } | Export-Clixml -Path $settingsFile
}

function Stop-NodeProcessesForPath {
    param([string]$PathToMatch)

    if (-not (Test-Path $PathToMatch)) {
        return
    }

    $normalizedPath = $PathToMatch.ToLowerInvariant()
    $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue

    foreach ($process in $nodeProcesses) {
        $commandLine = (Get-ValueOrDefault $process.CommandLine '').ToLowerInvariant()
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
    $savedSettings = Get-SavedSetupSettings

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Jira Ticket Cluster Alert Setup'
    $form.StartPosition = 'CenterScreen'
    $form.Size = New-Object System.Drawing.Size(500, 420)
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

    $baseUrlBox = New-Field -Form $form -LabelText 'Jira Base URL' -Top 60 -DefaultValue (Get-ValueOrDefault $savedSettings.JiraBaseUrl 'https://your-domain.atlassian.net')
    $emailBox = New-Field -Form $form -LabelText 'Jira Email' -Top 100 -DefaultValue (Get-ValueOrDefault $savedSettings.JiraEmail '')
    $tokenBox = New-Field -Form $form -LabelText 'Jira API Token' -Top 140 -DefaultValue (Get-ValueOrDefault $savedSettings.JiraApiToken '') -IsPassword $true
    $projectKeyBox = New-Field -Form $form -LabelText 'Jira Project Key' -Top 180 -DefaultValue (Get-ValueOrDefault $savedSettings.JiraProjectKey 'IT')
    $branchBox = New-Field -Form $form -LabelText 'Git Branch' -Top 220 -DefaultValue (Get-ValueOrDefault $savedSettings.Branch $branch)
    $targetFolderBox = New-Field -Form $form -LabelText 'Install Folder' -Top 260 -DefaultValue (Get-ValueOrDefault $savedSettings.TargetFolder $targetFolder)

    $saveButton = New-Object System.Windows.Forms.Button
    $saveButton.Text = 'Save Credentials'
    $saveButton.Left = 150
    $saveButton.Top = 300
    $saveButton.Width = 110
    $form.Controls.Add($saveButton)

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

    $saveButton.Add_Click({
        $settingsToSave = @{
            JiraBaseUrl = $baseUrlBox.Text.Trim()
            JiraEmail = $emailBox.Text.Trim()
            JiraApiToken = $tokenBox.Text
            JiraProjectKey = $projectKeyBox.Text.Trim()
            Branch = $branchBox.Text.Trim()
            TargetFolder = $targetFolderBox.Text.Trim()
        }

        if ([string]::IsNullOrWhiteSpace($settingsToSave.JiraBaseUrl) -or
            [string]::IsNullOrWhiteSpace($settingsToSave.JiraEmail) -or
            [string]::IsNullOrWhiteSpace($settingsToSave.JiraApiToken) -or
            [string]::IsNullOrWhiteSpace($settingsToSave.JiraProjectKey) -or
            [string]::IsNullOrWhiteSpace($settingsToSave.Branch) -or
            [string]::IsNullOrWhiteSpace($settingsToSave.TargetFolder)) {
            Show-Info 'Fill in all setup fields before saving credentials.'
            return
        }

        Save-SetupSettings -Settings $settingsToSave
        Show-Info "Credentials saved for this Windows user.`nThey will be pre-filled next time."
    })

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
JIRA_PROJECT_KEY=$($settings.JiraProjectKey)
POLL_INTERVAL_SECONDS=60
SIMILARITY_THRESHOLD=0.72
ALERT_WINDOW_HOURS=24
APP_STATUS_PORT=3333
"@ | Set-Content '.\.env' -Encoding UTF8

$env:JIRA_BASE_URL = $settings.JiraBaseUrl.TrimEnd('/')
$env:JIRA_EMAIL = $settings.JiraEmail
$env:JIRA_API_TOKEN = $settings.JiraApiToken
$env:JIRA_PROJECT_KEY = $settings.JiraProjectKey

Write-Host 'Installing dependencies...'
npm install
if ($LASTEXITCODE -ne 0) {
    Fail 'npm install failed.'
}

Show-Info "Setup finished. The app will now start from:`n$targetFolder`n`nYour API token is kept in memory for this run and is not written into the cloned repo."
Write-Host 'Starting the app...'
npm run dev
