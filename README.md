# Jira Ticket Cluster Alert

A beginner-friendly standalone desktop-style app that watches Jira tickets and alerts when 3 or more similar summaries appear.

## What it does
- Monitors Jira issues whose keys start with `IT-`
- Clusters similar summaries using word-overlap matching
- Sends a popup notification when a 3+ ticket cluster appears
- Saves ticket and alert history locally
- Shows a live status page so you can tell the app is running

## Setup
### Option A (recommended on Windows): one-click bootstrap
Run the PowerShell bootstrap script from a clean Windows PowerShell session:

```powershell
powershell -ExecutionPolicy Bypass -File .\bootstrap-windows.ps1
```

What it does:
- Stops running Node.js processes that can lock `node_modules`
- Clones a fresh copy into a new timestamped folder (does not delete your current folder)
- Fails fast if `package.json` still contains `better-sqlite3` (outdated commit / stale remote)
- Runs `npm install`, prompts for Jira settings, writes `.env`, then starts `npm run dev`

If you intentionally want to continue with an old clone, run with:

```powershell
powershell -ExecutionPolicy Bypass -File .\bootstrap-windows.ps1 -SkipDependencyCheck
```

### Option B: manual setup
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
