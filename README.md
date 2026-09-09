# Jira Ticket Cluster Alert

A beginner-friendly standalone desktop app that watches incoming Jira tickets and alerts when 3 or more tickets have very similar summaries.

## What this app does
- Monitors Jira for issues whose keys start with `IT-`
- Detects when 3 or more tickets have similar summaries
- Sends a local desktop popup alert
- Stores seen tickets and alert history locally
- Keeps Jira API settings in one place so updates are easy later

## Easy setup

### 1) Install Node.js
Install the latest LTS version of Node.js from:
https://nodejs.org/

### 2) Clone the repository
```bash
git clone https://github.com/RainerK64/jira-ticket-cluster-alert.git
cd jira-ticket-cluster-alert
```

### 3) Install dependencies
```bash
npm install
```

### 4) Create your config file
Copy `.env.example` to `.env` and fill in your Jira details.

### 5) Run the app
```bash
npm run dev
```

## Jira settings you will need
- Jira site URL
- Jira email or username
- Jira API token
- Project key or filter settings

## First version goal
This starter will include:
- Jira API client
- polling watcher
- summary similarity checker
- alert popup
- local storage
- beginner README

## Notes
This repo is being set up to be easy for beginners to use and easy to maintain later.
