import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { AlertCluster, AppStatus, StoredIssue } from '../shared/types';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'app.db');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS issues (
    key TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    summaryNormalized TEXT NOT NULL,
    summaryTokens TEXT NOT NULL,
    created TEXT NOT NULL,
    updated TEXT NOT NULL,
    url TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    count INTEGER NOT NULL,
    score REAL NOT NULL,
    issueKeys TEXT NOT NULL,
    summaries TEXT NOT NULL,
    firstSeenAt TEXT NOT NULL,
    lastSeenAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    running INTEGER NOT NULL,
    startedAt TEXT NOT NULL,
    lastPollAt TEXT,
    lastSuccessAt TEXT,
    lastError TEXT,
    nextPollAt TEXT,
    ticketsSeen INTEGER NOT NULL,
    alertsSent INTEGER NOT NULL
  );
`);

function ensureStatusRow(): void {
  const existing = db.prepare('SELECT 1 FROM app_status WHERE id = 1').get();
  if (!existing) {
    const startedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO app_status (id, running, startedAt, lastPollAt, lastSuccessAt, lastError, nextPollAt, ticketsSeen, alertsSent)
      VALUES (1, 1, ?, NULL, NULL, NULL, NULL, 0, 0)
    `).run(startedAt);
  }
}

ensureStatusRow();

export function getStoredIssues(): StoredIssue[] {
  return db.prepare(`SELECT * FROM issues ORDER BY created DESC`).all().map((row: any) => ({
    ...row,
    summaryTokens: JSON.parse(row.summaryTokens)
  })) as StoredIssue[];
}

export function saveIssue(issue: StoredIssue): void {
  db.prepare(`
    INSERT INTO issues (key, summary, summaryNormalized, summaryTokens, created, updated, url)
    VALUES (@key, @summary, @summaryNormalized, @summaryTokens, @created, @updated, @url)
    ON CONFLICT(key) DO UPDATE SET
      summary=excluded.summary,
      summaryNormalized=excluded.summaryNormalized,
      summaryTokens=excluded.summaryTokens,
      created=excluded.created,
      updated=excluded.updated,
      url=excluded.url
  `).run({ ...issue, summaryTokens: JSON.stringify(issue.summaryTokens) });
}

export function saveAlert(alert: AlertCluster): void {
  db.prepare(`
    INSERT INTO alerts (id, signature, count, score, issueKeys, summaries, firstSeenAt, lastSeenAt)
    VALUES (@id, @signature, @count, @score, @issueKeys, @summaries, @firstSeenAt, @lastSeenAt)
    ON CONFLICT(id) DO UPDATE SET
      signature=excluded.signature,
      count=excluded.count,
      score=excluded.score,
      issueKeys=excluded.issueKeys,
      summaries=excluded.summaries,
      firstSeenAt=excluded.firstSeenAt,
      lastSeenAt=excluded.lastSeenAt
  `).run({
    ...alert,
    issueKeys: JSON.stringify(alert.issueKeys),
    summaries: JSON.stringify(alert.summaries)
  });
}

export function getAlertById(id: string): AlertCluster | undefined {
  const row = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    signature: row.signature,
    count: row.count,
    score: Number(row.score),
    issueKeys: JSON.parse(row.issueKeys),
    summaries: JSON.parse(row.summaries),
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt
  };
}

export function getStatus(): AppStatus {
  return db.prepare(`SELECT * FROM app_status WHERE id = 1`).get() as AppStatus;
}

export function updateStatus(patch: Partial<AppStatus>): void {
  const current = getStatus();
  const next = { ...current, ...patch };
  db.prepare(`
    UPDATE app_status SET
      running = @running,
      startedAt = @startedAt,
      lastPollAt = @lastPollAt,
      lastSuccessAt = @lastSuccessAt,
      lastError = @lastError,
      nextPollAt = @nextPollAt,
      ticketsSeen = @ticketsSeen,
      alertsSent = @alertsSent
    WHERE id = 1
  `).run(next);
}
