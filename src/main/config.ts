import dotenv from 'dotenv';

dotenv.config();

export type AppConfig = {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  pollIntervalSeconds: number;
  similarityThreshold: number;
  alertWindowHours: number;
  appStatusPort: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    jiraBaseUrl: requiredEnv('JIRA_BASE_URL').replace(/\/$/, ''),
    jiraEmail: requiredEnv('JIRA_EMAIL'),
    jiraApiToken: requiredEnv('JIRA_API_TOKEN'),
    jiraProjectKey: process.env.JIRA_PROJECT_KEY ?? 'IT',
    pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS ?? '60'),
    similarityThreshold: Number(process.env.SIMILARITY_THRESHOLD ?? '0.72'),
    alertWindowHours: Number(process.env.ALERT_WINDOW_HOURS ?? '24'),
    appStatusPort: Number(process.env.APP_STATUS_PORT ?? '3333')
  };
}
