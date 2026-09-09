# jira-ticket-cluster-alert

Desktop app that watches Jira tickets whose keys start with `IT-`, groups tickets with the same or very similar summaries, and shows a desktop popup when a cluster reaches 3 or more tickets.

## What this app does

- Polls Jira on a timer.
- Only checks tickets in the Jira project/key prefix you configure (default: `IT`).
- Normalizes and compares recent ticket summaries.
- Alerts when 3 or more similar tickets appear inside the configured time window.
- Stores seen tickets and alert history in a local SQLite database file.
- Avoids repeating the same alert unless a new matching ticket joins the cluster.
- Shows a small status window so you can see what the app is doing.

## Tech choices

- **Electron** for a standalone desktop window and desktop notifications
- **Node.js + TypeScript** for maintainable code
- **SQLite** via Node's built-in `node:sqlite`

## Project structure

```text
src/main/config.ts        Loads `.env` settings
src/main/jiraClient.ts    Jira base URL, auth, endpoints, and request logic
src/main/storage.ts       Local SQLite storage
src/main/matcher.ts       Summary normalization + similarity clustering
src/main/alertDecider.ts  Duplicate-alert suppression logic
src/main/alertService.ts  Desktop popup notifications
src/main/watcher.ts       Polling loop
src/main/main.ts          Electron app entry point
src/renderer/             Simple status window UI
```

## Requirements before you start

Please install these first:

1. **Git** - https://git-scm.com/downloads
2. **Node.js** (version 22 or newer recommended) - https://nodejs.org/

After installing them, open:

- **Windows:** Command Prompt or PowerShell
- **Mac:** Terminal
- **Linux:** Terminal

## How to clone this repository

Copy and run these commands one by one:

```bash
git clone https://github.com/RainerK64/jira-ticket-cluster-alert.git
cd jira-ticket-cluster-alert
```

## How to install the app

Run:

```bash
npm install
```

This downloads the desktop app dependencies.

## How to configure the app

1. In the project folder, make a copy of `.env.example`.
2. Rename the copy to `.env`.
3. Open `.env` in a text editor.
4. Fill in your Jira details.

Example:

```env
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=replace_with_your_api_token
JIRA_PROJECT_KEY=IT
JIRA_SEARCH_PATH=/rest/api/3/search
POLL_INTERVAL_SECONDS=60
SIMILARITY_THRESHOLD=0.55
ALERT_WINDOW_HOURS=24
CLUSTER_THRESHOLD=3
JIRA_MAX_RESULTS=100
SQLITE_PATH=./data/jira-ticket-cluster-alert.sqlite
```

### What each setting means

- `JIRA_BASE_URL` - Your Atlassian site URL
- `JIRA_EMAIL` - The Jira account email used for the API
- `JIRA_API_TOKEN` - Your Jira API token
- `JIRA_PROJECT_KEY` - Usually `IT`, so tickets like `IT-123` are included
- `JIRA_SEARCH_PATH` - Central Jira search endpoint path; change this in one place if the API changes
- `POLL_INTERVAL_SECONDS` - How often the app checks Jira
- `SIMILARITY_THRESHOLD` - Higher means stricter matching; `0.55` is a practical default
- `ALERT_WINDOW_HOURS` - How far back the app looks when building clusters
- `CLUSTER_THRESHOLD` - Number of similar tickets required before alerting
- `JIRA_MAX_RESULTS` - Maximum Jira results fetched each poll
- `SQLITE_PATH` - Where the local database file is stored

## How to run the app

Run:

```bash
npm start
```

What happens next:

1. The app opens a desktop window.
2. It starts polling Jira automatically.
3. When 3 or more similar `IT-*` tickets are found within the time window, you get a desktop popup notification.
4. The window also shows current clusters, the last polling result, and recent alerts.

## How to stop the app

Use either of these:

- Close the app window, or
- Go back to the terminal and press `Ctrl + C`

## Where data is stored

The app writes local data to:

```text
./data/jira-ticket-cluster-alert.sqlite
```

This file stores:

- seen Jira tickets
- recent alert history

## How to test the app

Run:

```bash
npm test
```

## Notes about similarity matching

The app uses a practical fuzzy-matching approach:

- summaries are lowercased and cleaned
- common punctuation is removed
- token overlap is checked
- text bigram similarity is checked
- tickets are clustered when the combined similarity score reaches the threshold

## If Jira changes later

Update these places first:

- `.env` for base URL, auth, or endpoint path changes
- `src/main/jiraClient.ts` for request/response changes
- `src/main/config.ts` for defaults and config names

This keeps Jira integration centralized so future updates are easy.

## Troubleshooting

### The app says a required setting is missing

Make sure:

- `.env` exists
- you copied from `.env.example`
- you filled in `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`

### I do not see desktop popup alerts

- Make sure your operating system allows notifications for Electron apps
- Keep the main app window open while testing

### Jira authentication fails

- Re-check the base URL
- Re-check the email address
- Re-check the API token
- Confirm the Jira account can search the target project
