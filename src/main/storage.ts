import fs from 'fs';
import path from 'path';
import { AlertCluster, AppStatus, StoredIssue } from '../shared/types';

const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'app-state.json');

type StorageState = {
  issues: StoredIssue[];
  alerts: AlertCluster[];
  appStatus: AppStatus;
};

function createDefaultStatus(): AppStatus {
  return {
    running: true,
    startedAt: new Date().toISOString(),
    lastPollAt: null,
    lastSuccessAt: null,
    lastError: null,
    nextPollAt: null,
    ticketsSeen: 0,
    alertsSent: 0
  };
}

function createDefaultState(): StorageState {
  return {
    issues: [],
    alerts: [],
    appStatus: createDefaultStatus()
  };
}

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function normalizeStatus(status: Partial<AppStatus> | undefined): AppStatus {
  const defaults = createDefaultStatus();

  return {
    ...defaults,
    ...status,
    startedAt: status?.startedAt || defaults.startedAt
  };
}

function normalizeState(state: Partial<StorageState> | undefined): StorageState {
  return {
    issues: Array.isArray(state?.issues) ? state.issues : [],
    alerts: Array.isArray(state?.alerts) ? state.alerts : [],
    appStatus: normalizeStatus(state?.appStatus)
  };
}

function writeState(state: StorageState): void {
  ensureDataDir();
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tempFile, dataFile);
}

function resetState(): StorageState {
  const initialState = createDefaultState();
  writeState(initialState);
  return initialState;
}

function readState(): StorageState {
  ensureDataDir();

  if (!fs.existsSync(dataFile)) {
    return resetState();
  }

  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    if (!raw.trim()) {
      return resetState();
    }

    return normalizeState(JSON.parse(raw) as Partial<StorageState>);
  } catch {
    const backupFile = `${dataFile}.corrupt-${Date.now()}`;
    fs.renameSync(dataFile, backupFile);
    return resetState();
  }
}

export function getStoredIssues(): StoredIssue[] {
  return readState().issues;
}

export function saveIssue(issue: StoredIssue): void {
  const state = readState();
  const index = state.issues.findIndex((storedIssue) => storedIssue.key === issue.key);

  if (index >= 0) {
    state.issues[index] = issue;
  } else {
    state.issues.unshift(issue);
  }

  writeState(state);
}

export function saveAlert(alert: AlertCluster): void {
  const state = readState();
  const index = state.alerts.findIndex((storedAlert) => storedAlert.id === alert.id);

  if (index >= 0) {
    state.alerts[index] = alert;
  } else {
    state.alerts.unshift(alert);
  }

  writeState(state);
}

export function getAlertById(id: string): AlertCluster | undefined {
  return readState().alerts.find((alert) => alert.id === id);
}

export function getStatus(): AppStatus {
  return readState().appStatus;
}

export function updateStatus(patch: Partial<AppStatus>): void {
  const state = readState();
  state.appStatus = { ...state.appStatus, ...patch };
  writeState(state);
}
