# Jira Ticket Cluster Alert

A beginner-friendly standalone desktop-style app that watches Jira tickets and alerts when 3 or more similar summaries appear.

## What it does
- Monitors Jira issues whose keys start with `IT-`
- Clusters similar summaries using word-overlap matching
- Sends a popup notification when a 3+ ticket cluster appears
- Saves ticket, alert, and app status history locally in `data/app-state.json`
- Shows a live status page so you can tell the app is running

## Setup
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
   This app now uses a plain JSON state file, so no native SQLite build tools are required.
4. Copy `.env.example` to `.env` and fill in your Jira details.
5. Run the app:
   ```bash
   npm run dev
   ```

## Local data storage
- The app creates `data/app-state.json` automatically on startup if it is missing.
- You can delete that file to reset local state; it will be recreated on the next run.

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
