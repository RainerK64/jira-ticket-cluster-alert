import path from "node:path";
import dotenv from "dotenv";

export interface AppConfig {
  jira: {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
    maxResults: number;
    endpoints: {
      search: string;
    };
    requestTimeoutMs: number;
  };
  polling: {
    intervalMs: number;
  };
  alerting: {
    similarityThreshold: number;
    windowHours: number;
    clusterThreshold: number;
  };
  storage: {
    databasePath: string;
  };
  paths: {
    projectRoot: string;
    rendererHtmlPath: string;
  };
}

const projectRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(projectRoot, ".env") });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required setting: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function numberFromEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric setting for ${name}: ${rawValue}`);
  }

  return parsed;
}

export function loadConfig(): AppConfig {
  const databasePath = path.resolve(
    projectRoot,
    process.env.SQLITE_PATH?.trim() || "./data/jira-ticket-cluster-alert.sqlite",
  );

  const projectKey = (process.env.JIRA_PROJECT_KEY?.trim() || "IT").toUpperCase();

  return {
    jira: {
      baseUrl: requireEnv("JIRA_BASE_URL").replace(/\/+$/, ""),
      email: requireEnv("JIRA_EMAIL"),
      apiToken: requireEnv("JIRA_API_TOKEN"),
      projectKey,
      maxResults: numberFromEnv("JIRA_MAX_RESULTS", 100),
      endpoints: {
        search: process.env.JIRA_SEARCH_PATH?.trim() || "/rest/api/3/search",
      },
      requestTimeoutMs: 15_000,
    },
    polling: {
      intervalMs: numberFromEnv("POLL_INTERVAL_SECONDS", 60) * 1_000,
    },
    alerting: {
      similarityThreshold: numberFromEnv("SIMILARITY_THRESHOLD", 0.55),
      windowHours: numberFromEnv("ALERT_WINDOW_HOURS", 24),
      clusterThreshold: numberFromEnv("CLUSTER_THRESHOLD", 3),
    },
    storage: {
      databasePath,
    },
    paths: {
      projectRoot,
      rendererHtmlPath: path.join(projectRoot, "src/renderer/index.html"),
    },
  };
}
