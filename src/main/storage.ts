import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AlertRecord, JiraIssue, StoredIssue } from "../shared/types";
import { normalizeSummary } from "./matcher";

export class Storage {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        issue_key TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        normalized_summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        issue_url TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cluster_signature TEXT NOT NULL,
        representative_summary TEXT NOT NULL,
        issue_keys_json TEXT NOT NULL,
        ticket_count INTEGER NOT NULL,
        newest_issue_created_at TEXT NOT NULL,
        alerted_at TEXT NOT NULL
      );
    `);
  }

  saveIssues(issues: JiraIssue[]): void {
    if (issues.length === 0) {
      return;
    }

    const statement = this.database.prepare(`
      INSERT INTO issues (
        issue_key,
        summary,
        normalized_summary,
        created_at,
        updated_at,
        last_seen_at,
        issue_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(issue_key) DO UPDATE SET
        summary = excluded.summary,
        normalized_summary = excluded.normalized_summary,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at,
        issue_url = excluded.issue_url
    `);

    const now = new Date().toISOString();

    this.database.exec("BEGIN");
    try {
      for (const issue of issues) {
        statement.run(
          issue.key,
          issue.summary,
          normalizeSummary(issue.summary),
          issue.createdAt,
          issue.updatedAt,
          now,
          issue.url,
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getRecentIssues(windowStartIso: string): StoredIssue[] {
    const rows = this.database
      .prepare(`
        SELECT
          issue_key,
          summary,
          normalized_summary,
          created_at,
          updated_at,
          last_seen_at,
          issue_url
        FROM issues
        WHERE created_at >= ?
        ORDER BY created_at ASC
      `)
      .all(windowStartIso) as Array<{
      issue_key: string;
      summary: string;
      normalized_summary: string;
      created_at: string;
      updated_at: string;
      last_seen_at: string;
      issue_url: string;
    }>;

    return rows.map((row) => ({
      key: row.issue_key,
      summary: row.summary,
      normalizedSummary: row.normalized_summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      url: row.issue_url,
    }));
  }

  getLatestAlertForCluster(clusterSignature: string): AlertRecord | undefined {
    const row = this.database
      .prepare(`
        SELECT
          id,
          cluster_signature,
          representative_summary,
          issue_keys_json,
          ticket_count,
          newest_issue_created_at,
          alerted_at
        FROM alerts
        WHERE cluster_signature = ?
        ORDER BY alerted_at DESC, id DESC
        LIMIT 1
      `)
      .get(clusterSignature) as
      | {
          id: number;
          cluster_signature: string;
          representative_summary: string;
          issue_keys_json: string;
          ticket_count: number;
          newest_issue_created_at: string;
          alerted_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      clusterSignature: row.cluster_signature,
      representativeSummary: row.representative_summary,
      issueKeys: JSON.parse(row.issue_keys_json) as string[],
      ticketCount: row.ticket_count,
      newestIssueCreatedAt: row.newest_issue_created_at,
      alertedAt: row.alerted_at,
    };
  }

  recordAlert(alert: AlertRecord): void {
    this.database
      .prepare(`
        INSERT INTO alerts (
          cluster_signature,
          representative_summary,
          issue_keys_json,
          ticket_count,
          newest_issue_created_at,
          alerted_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        alert.clusterSignature,
        alert.representativeSummary,
        JSON.stringify(alert.issueKeys),
        alert.ticketCount,
        alert.newestIssueCreatedAt,
        alert.alertedAt,
      );
  }

  getRecentAlerts(limit: number): AlertRecord[] {
    const rows = this.database
      .prepare(`
        SELECT
          id,
          cluster_signature,
          representative_summary,
          issue_keys_json,
          ticket_count,
          newest_issue_created_at,
          alerted_at
        FROM alerts
        ORDER BY alerted_at DESC, id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
      id: number;
      cluster_signature: string;
      representative_summary: string;
      issue_keys_json: string;
      ticket_count: number;
      newest_issue_created_at: string;
      alerted_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      clusterSignature: row.cluster_signature,
      representativeSummary: row.representative_summary,
      issueKeys: JSON.parse(row.issue_keys_json) as string[],
      ticketCount: row.ticket_count,
      newestIssueCreatedAt: row.newest_issue_created_at,
      alertedAt: row.alerted_at,
    }));
  }
}
