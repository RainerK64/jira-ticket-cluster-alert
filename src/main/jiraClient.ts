import { JiraIssue } from '../shared/types';

export class JiraClient {
  constructor(
    private readonly baseUrl: string,
    private readonly email: string,
    private readonly apiToken: string
  ) {}

  private get authHeader(): string {
    const token = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return `Basic ${token}`;
  }

  async searchRecentIssues(projectKey: string, sinceIso: string): Promise<JiraIssue[]> {
    const jql = `project = ${projectKey} AND key ~ "IT-" AND updated >= "${sinceIso}" ORDER BY created DESC`;
    const url = `${this.baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,created,updated`;

    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json'
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jira API error: ${res.status} ${res.statusText} ${text}`.trim());
    }

    const data = (await res.json()) as {
      issues: Array<{
        key: string;
        fields: {
          summary: string;
          created: string;
          updated: string;
        };
      }>;
    };

    return data.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      created: issue.fields.created,
      updated: issue.fields.updated,
      url: `${this.baseUrl}/browse/${issue.key}`
    }));
  }
}
