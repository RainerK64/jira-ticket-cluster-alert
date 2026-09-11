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
const pendingMutations: Array<(state: StorageState) => void> = [];
let flushingMutations = false;

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
  cachedState = initialState;
  writeState(initialState);
  return initialState;
}

function readStateFromDisk(): StorageState {
  ensureDataDir();

  if (!fs.existsSync(dataFile)) {
    return resetState();
  }

  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    if (!raw.trim()) {
      return resetState();
    }

    try {
      const normalizedState = normalizeState(JSON.parse(raw) as Partial<StorageState>);
      const normalizedRaw = JSON.stringify(normalizedState, null, 2);
      if (normalizedRaw !== raw) {
        cachedState = normalizedState;
        writeState(normalizedState);
      }
      return normalizedState;
    } catch {
      const backupFile = `${dataFile}.corrupt-${Date.now()}`;

      try {
        fs.renameSync(dataFile, backupFile);
      } catch {
        // If the backup rename fails, continue with a reset state rather than crashing startup.
      }

      return resetState();
    }
  } catch {
    throw new Error(`Failed to read storage state from ${dataFile}`);
  }
}

function getState(): StorageState {
  const currentVersion = getDataFileVersion();

  if (!cachedState || String(cachedStateMtimeMs) !== currentVersion) {
    cachedState = readStateFromDisk();
    cachedStateMtimeMs = getDataFileMtimeMs();
  }

  return cachedState;
}

function updateState(mutator: (state: StorageState) => void): void {
  pendingMutations.push(mutator);

  if (flushingMutations) {
    return;
  }

  flushingMutations = true;

  try {
    const nextState = structuredClone(readStateFromDisk());

    while (pendingMutations.length) {
      const nextMutation = pendingMutations.shift();
      nextMutation?.(nextState);
    }

    cachedState = normalizeState(nextState);
    writeState(cachedState);
  } finally {
    flushingMutations = false;
  }
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
