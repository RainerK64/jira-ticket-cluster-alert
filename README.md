# Jira Ticket Cluster Alert

A beginner-friendly standalone desktop-style app that watches Jira tickets and alerts when 3 or more similar summaries appear.

## What it does
- Monitors Jira issues in the configured project from the start of the current work week using the local machine time
- Clusters similar summaries using word-overlap matching
- Sends a popup notification when a 3+ ticket cluster appears
- Saves ticket and alert history locally in a JSON file
- Shows a live status page so you can tell the app is running

## Setup
### Windows quick start
1. Save `run-jira-alert.ps1` somewhere on your PC, for example `C:\temp\run-jira-alert.ps1`.
2. Run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run-jira-alert.ps1
   ```
3. A setup window will pop up and ask for your Jira URL, email, API token, project key, Git branch, and install folder.
4. The script will then stop only matching app Node.js processes for that install folder, download the selected branch, verify `better-sqlite3` is gone, install dependencies, write `.env`, and start the app.

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
- If the setup script says the downloaded `package.json` still references `better-sqlite3`, the GitHub branch it downloaded is still outdated.

## How to tell it is running
- You will see console messages like:
  - `Jira Ticket Cluster Alert started.`
  - `Polling every 60 seconds...`
  - `[watcher] using local work week start 2026-09-08 00:00 +0200 (GMT+2)`
  - `[watcher] fetched 3 recent issues from project IT`
  - `[watcher] 3 stored issues since start of work week, 1 matching clusters found`
  - `[running] last poll: ...`
- Open the status page in your browser:
  - `http://localhost:3333`
- Alert popups and the status page show the matching ticket numbers.
- On the status page, the ticket numbers are clickable links to the Jira tickets.
- If port 3333 is busy, the app will try 3334 and tell you in the console.
- When it alerts, you will get a desktop notification.
- The app uses your PC's local timezone to decide when the work week starts, with Monday at 00:00 local time.

## Security note
If you ever paste a real Jira API token into chat or share it, revoke it and create a new one.
