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
let writeQueue: Promise<void> = Promise.resolve();

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

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withFileLock<T>(action: () => T): T {
  ensureDataDir();
  const lockDir = `${dataFile}.lock`;
  const deadline = Date.now() + 2000;

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= deadline) {
        throw error;
      }

      sleep(25);
    }
  }

  try {
    return action();
  } finally {
    try {
      fs.rmdirSync(lockDir);
    } catch {
      // Ignore lock cleanup errors.
    }
  }
}

function writeState(state: StorageState): void {
  ensureDataDir();
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2), 'utf8');
}

function resetState(): StorageState {
  const initialState = createDefaultState();
  cachedState = initialState;
  withFileLock(() => writeState(initialState));
  return initialState;
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
  if (!cachedState) {
    cachedState = readStateFromDisk();
  }

  return cachedState;
}

function updateState(mutator: (state: StorageState) => void): void {
  let nextState!: StorageState;
  let writeError: unknown;

  writeQueue = writeQueue.then(() => {
    withFileLock(() => {
      nextState = structuredClone(readStateFromDisk());
      mutator(nextState);
      cachedState = normalizeState(nextState);
      writeState(cachedState);
    });
  }).catch((error) => {
    writeError = error;
  });

  if (writeError) {
    throw writeError;
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
