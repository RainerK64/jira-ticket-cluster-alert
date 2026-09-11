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

let cachedState: StorageState | null = null;
let cachedStateMtimeMs: number | null = null;

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
    alerts: Array.isArray(state?.alerts) ? state.alerts.map((alert) => ({
      ...alert,
      issueUrls: Array.isArray(alert.issueUrls) ? alert.issueUrls : []
    })) : [],
    appStatus: normalizeStatus(state?.appStatus)
  };
}

function getDataFileMtimeMs(): number | null {
  try {
    return fs.statSync(dataFile).mtimeMs;
  } catch {
    return null;
  }
}

function getDataFileVersion(): string {
  return fs.existsSync(dataFile) ? String(getDataFileMtimeMs()) : 'missing';
}

function writeState(state: StorageState): void {
  ensureDataDir();
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2), 'utf8');
  cachedStateMtimeMs = getDataFileMtimeMs();
}

function resetState(): StorageState {
  const initialState = createDefaultState();
  const normalizedState = normalizeState(initialState);
  cachedState = normalizedState;
  writeState(normalizedState);
  return normalizedState;
}

function readStateFromDisk(): StorageState {
  ensureDataDir();

  if (!fs.existsSync(dataFile)) {
    return createDefaultState();
  }

  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    if (!raw.trim()) {
      return createDefaultState();
    }

    try {
      return normalizeState(JSON.parse(raw) as Partial<StorageState>);
    } catch {
      const backupFile = `${dataFile}.corrupt-${Date.now()}`;

      try {
        fs.renameSync(dataFile, backupFile);
      } catch {
        // If the backup rename fails, continue with a reset state rather than crashing startup.
      }

      return createDefaultState();
    }
  } catch {
    throw new Error(`Failed to read storage state from ${dataFile}`);
  }
}

function getState(): StorageState {
  const currentVersion = getDataFileVersion();

  if (!cachedState || String(cachedStateMtimeMs) !== currentVersion) {
    cachedState = readStateFromDisk();
    cachedStateMtimeMs = currentVersion === 'missing' ? null : Number(currentVersion);
  }

  return cachedState;
}

function updateState(mutator: (state: StorageState) => void): void {
  const nextState = structuredClone(readStateFromDisk());
  mutator(nextState);
  cachedState = normalizeState(nextState);
  writeState(cachedState);
}

export function getStoredIssues(): StoredIssue[] {
  return structuredClone(getState().issues);
}

export function saveIssue(issue: StoredIssue): void {
  updateState((state) => {
    const index = state.issues.findIndex((storedIssue) => storedIssue.key === issue.key);

    if (index >= 0) {
      state.issues[index] = issue;
    } else {
      state.issues.unshift(issue);
    }
  });
}

export function saveAlert(alert: AlertCluster): void {
  updateState((state) => {
    const index = state.alerts.findIndex((storedAlert) => storedAlert.id === alert.id);

    if (index >= 0) {
      state.alerts[index] = alert;
    } else {
      state.alerts.unshift(alert);
    }
  });
}

export function getAlertById(id: string): AlertCluster | undefined {
  const alert = getState().alerts.find((entry) => entry.id === id);
  return alert ? structuredClone(alert) : undefined;
}

export function getRecentAlerts(limit = 5): AlertCluster[] {
  return structuredClone(getState().alerts.slice(0, limit));
}

export function getStatus(): AppStatus {
  return structuredClone(getState().appStatus);
}

export function updateStatus(patch: Partial<AppStatus>): void {
  updateState((state) => {
    state.appStatus = normalizeStatus({ ...state.appStatus, ...patch });
  });
}
