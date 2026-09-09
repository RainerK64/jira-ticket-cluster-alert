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
2. Run the bootstrap script from a copy of this repository:
   ```powershell
   .\bootstrap-windows.ps1
   ```
3. The script will stop old Node.js processes, clone a fresh copy into a new folder, default to the current repository branch when possible, verify the clone no longer references `better-sqlite3`, install dependencies, prompt for your Jira settings, write `.env`, and start the app.

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
- If the bootstrap script says the cloned `package.json` still references `better-sqlite3`, the specific remote branch it cloned is still outdated and should be updated before continuing.
- If needed, you can force a different source with `.\bootstrap-windows.ps1 -Branch main -RepositoryUrl https://github.com/RainerK64/jira-ticket-cluster-alert.git`.

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
