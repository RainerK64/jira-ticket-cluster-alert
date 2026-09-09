import fs from 'fs';
import path from 'path';
import { AlertCluster, AppStatus, StoredIssue } from '../shared/types';

const dataDir = path.join(process.cwd(), 'data');
const statePath = path.join(dataDir, 'app-state.json');

type StorageState = {
  issues: Record<string, StoredIssue>;
  alerts: Record<string, AlertCluster>;
  status: AppStatus;
};

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function defaultStatus(): AppStatus {
  return {
    running: false,
    startedAt: new Date().toISOString(),
    lastPollAt: null,
    lastSuccessAt: null,
    lastError: null,
    nextPollAt: null,
    ticketsSeen: 0,
    alertsSent: 0
  };
}

function defaultState(): StorageState {
  return {
    issues: {},
    alerts: {},
    status: defaultStatus()
  };
}

function normalizeIssue(issue: Partial<StoredIssue> | undefined): StoredIssue | undefined {
  if (
    !issue?.key ||
    !issue.summary ||
    !issue.summaryNormalized ||
    !Array.isArray(issue.summaryTokens) ||
    !issue.created ||
    !issue.updated ||
    !issue.url
  ) {
    return undefined;
  }

  return {
    key: issue.key,
    summary: issue.summary,
    summaryNormalized: issue.summaryNormalized,
    summaryTokens: issue.summaryTokens.filter((token): token is string => typeof token === 'string'),
    created: issue.created,
    updated: issue.updated,
    url: issue.url
  };
}

function normalizeAlert(alert: Partial<AlertCluster> | undefined): AlertCluster | undefined {
  if (
    !alert?.id ||
    !alert.signature ||
    typeof alert.count !== 'number' ||
    typeof alert.score !== 'number' ||
    !Array.isArray(alert.issueKeys) ||
    !Array.isArray(alert.summaries) ||
    !alert.firstSeenAt ||
    !alert.lastSeenAt
  ) {
    return undefined;
  }

  return {
    id: alert.id,
    signature: alert.signature,
    count: alert.count,
    score: alert.score,
    issueKeys: alert.issueKeys.filter((value): value is string => typeof value === 'string'),
    summaries: alert.summaries.filter((value): value is string => typeof value === 'string'),
    firstSeenAt: alert.firstSeenAt,
    lastSeenAt: alert.lastSeenAt
  };
}

function normalizeStatus(status: Partial<AppStatus> | undefined): AppStatus {
  const fallback = defaultStatus();

  return {
    running: typeof status?.running === 'boolean' ? status.running : fallback.running,
    startedAt: status?.startedAt || fallback.startedAt,
    lastPollAt: status?.lastPollAt ?? null,
    lastSuccessAt: status?.lastSuccessAt ?? null,
    lastError: status?.lastError ?? null,
    nextPollAt: status?.nextPollAt ?? null,
    ticketsSeen: typeof status?.ticketsSeen === 'number' ? status.ticketsSeen : fallback.ticketsSeen,
    alertsSent: typeof status?.alertsSent === 'number' ? status.alertsSent : fallback.alertsSent
  };
}

function normalizeState(raw: unknown): StorageState {
  const value = (raw && typeof raw === 'object') ? raw as Partial<StorageState> : {};
  const issues = Object.values(value.issues ?? {}).reduce<Record<string, StoredIssue>>((result, issue) => {
    const normalized = normalizeIssue(issue);
    if (normalized) {
      result[normalized.key] = normalized;
    }
    return result;
  }, {});
  const alerts = Object.values(value.alerts ?? {}).reduce<Record<string, AlertCluster>>((result, alert) => {
    const normalized = normalizeAlert(alert);
    if (normalized) {
      result[normalized.id] = normalized;
    }
    return result;
  }, {});

  return {
    issues,
    alerts,
    status: normalizeStatus(value.status)
  };
}

function writeState(state: StorageState): void {
  ensureDataDir();
  const normalized = normalizeState(state);
  const tempPath = `${statePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tempPath, statePath);
}

function readState(): StorageState {
  ensureDataDir();

  if (!fs.existsSync(statePath)) {
    const initialState = defaultState();
    writeState(initialState);
    return initialState;
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const state = normalizeState(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(state)) {
      writeState(state);
    }
    return state;
  } catch {
    const fallbackState = defaultState();
    writeState(fallbackState);
    return fallbackState;
  }
}

export function getStoredIssues(): StoredIssue[] {
  return Object.values(readState().issues).sort((a, b) => b.created.localeCompare(a.created));
}

export function saveIssue(issue: StoredIssue): void {
  const state = readState();
  state.issues[issue.key] = issue;
  writeState(state);
}

export function saveAlert(alert: AlertCluster): void {
  const state = readState();
  state.alerts[alert.id] = alert;
  writeState(state);
}

export function getAlertById(id: string): AlertCluster | undefined {
  return readState().alerts[id];
}

export function getStatus(): AppStatus {
  return readState().status;
}

export function updateStatus(patch: Partial<AppStatus>): void {
  const state = readState();
  state.status = normalizeStatus({ ...state.status, ...patch });
  writeState(state);
}
