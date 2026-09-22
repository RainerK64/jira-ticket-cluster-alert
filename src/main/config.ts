import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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
  customIgnoredSummaries: string[];
  customIgnoredSummaryPrefixes: string[];
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function loadSavedWindowsToken(): string | null {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) {
    return null;
  }

  const settingsPath = path.join(process.env.LOCALAPPDATA, 'JiraTicketClusterAlert', 'setup-settings.xml');
  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  const escapedSettingsPath = settingsPath.replace(/'/g, "''");
  const script = [
    `$saved = Import-Clixml -Path '${escapedSettingsPath}'`,
    "if ($saved.JiraApiToken) {",
    '  $secureToken = ConvertTo-SecureString $saved.JiraApiToken',
    "  [System.Net.NetworkCredential]::new('', $secureToken).Password",
    '}'
  ].join('; ');

  for (const command of ['powershell.exe', 'pwsh.exe']) {
    try {
      const value = execFileSync(command, ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();

      if (value) {
        return value;
      }
    } catch {
      // Try the next available PowerShell command.
    }
  }

  return null;
}

function requiredApiToken(): string {
  if (process.env.JIRA_API_TOKEN !== undefined) {
    return requiredEnv('JIRA_API_TOKEN');
  }

  return loadSavedWindowsToken() || requiredEnv('JIRA_API_TOKEN');
}

function parseNumber(name: string, fallback: string): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number`);
  }
  return value;
}

function parseStringList(name: string): string[] {
  const rawValue = process.env[name];
  if (!rawValue) {
    return [];
  }

  return rawValue
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  return {
    jiraBaseUrl: requiredEnv('JIRA_BASE_URL').replace(/\/$/, ''),
    jiraEmail: requiredEnv('JIRA_EMAIL'),
    jiraApiToken: requiredApiToken(),
    jiraProjectKey: process.env.JIRA_PROJECT_KEY ?? 'IT',
    pollIntervalSeconds: parseNumber('POLL_INTERVAL_SECONDS', '60'),
    similarityThreshold: Math.min(0.99, Math.max(0.1, Number(process.env.SIMILARITY_THRESHOLD ?? '0.72'))),
    alertWindowHours: parseNumber('ALERT_WINDOW_HOURS', '24'),
    appStatusPort: parseNumber('APP_STATUS_PORT', '3333'),
    customIgnoredSummaries: parseStringList('CUSTOM_IGNORED_SUMMARIES'),
    customIgnoredSummaryPrefixes: parseStringList('CUSTOM_IGNORED_SUMMARY_PREFIXES')
  };
}
