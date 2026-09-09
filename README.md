# Jira Ticket Cluster Alert

A beginner-friendly standalone desktop-style app that watches Jira tickets and alerts when 3 or more similar summaries appear.

## What it does
- Monitors Jira issues whose keys start with `IT-`
- Clusters similar summaries using word-overlap matching
- Sends a popup notification when a 3+ ticket cluster appears
- Saves ticket and alert history locally in a JSON file
- Shows a live status page so you can tell the app is running

## Setup
### Windows one-click bootstrap
1. Open Windows PowerShell.
2. Run the simple setup script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run-jira-alert.ps1
   ```
3. The script will stop old Node.js processes, download the updated working branch, verify the clone no longer references `better-sqlite3`, install dependencies, prompt for your Jira settings, write `.env`, and start the app.
4. If you need the more configurable version, use `.\bootstrap-windows.ps1`.

### Manual setup
1. Install Node.js LTS: https://nodejs.org/
2. Clone the repo:
   ```bash
   git clone https://github.com/RainerK64/jira-ticket-cluster-alert.git
   cd jira-ticket-cluster-alert
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and fill in your Jira details.
5. Run the app:
   ```bash
   npm run dev
   ```

## Local data
- Runtime state is stored in `data/app-state.json`.
- If the setup script says the cloned `package.json` still references `better-sqlite3`, the remote branch it downloaded is still outdated and should be updated before continuing.
- `run-jira-alert.ps1` intentionally downloads the updated working branch directly so beginners do not accidentally clone a stale default branch.

## How to tell it is running
- You will see console messages like:
  - `Jira Ticket Cluster Alert started.`
  - `Polling every 60 seconds...`
  - `[running] last poll: ...`
- Open the status page in your browser:
  - `http://localhost:3333`
- If port 3333 is busy, the app will try 3334 and tell you in the console.
- When it alerts, you will get a desktop notification.

## Security note
If you ever paste a real Jira API token into chat or share it, revoke it and create a new one.
