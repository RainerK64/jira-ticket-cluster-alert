import dotenv from 'dotenv';

dotenv.config();

export type AppConfig = {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  pollIntervalSeconds: number;
  similarityThreshold: number;
  workWeekTimezoneOffsetHours: number;
  appStatusPort: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseNumber(name: string, fallback: string): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    jiraBaseUrl: requiredEnv('JIRA_BASE_URL').replace(/\/$/, ''),
    jiraEmail: requiredEnv('JIRA_EMAIL'),
    jiraApiToken: requiredEnv('JIRA_API_TOKEN'),
    jiraProjectKey: process.env.JIRA_PROJECT_KEY ?? 'IT',
    pollIntervalSeconds: parseNumber('POLL_INTERVAL_SECONDS', '60'),
    similarityThreshold: Math.min(0.99, Math.max(0.1, Number(process.env.SIMILARITY_THRESHOLD ?? '0.72'))),
    workWeekTimezoneOffsetHours: parseNumber('WORK_WEEK_TIMEZONE_OFFSET_HOURS', '2'),
    appStatusPort: parseNumber('APP_STATUS_PORT', '3333')
  };
}
