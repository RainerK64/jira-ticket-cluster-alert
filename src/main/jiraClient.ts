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

  private async search(url: string, jql: string): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jql,
        maxResults: 50,
        fields: ['summary', 'created', 'updated']
      })
    });
  }

  private getRelativeUpdatedFilter(sinceIso: string): string {
    const sinceTime = new Date(sinceIso).getTime();
    if (!Number.isFinite(sinceTime)) {
      return '-24h';
    }

    const hoursAgo = Math.max(1, Math.ceil((Date.now() - sinceTime) / (60 * 60 * 1000)));
    return `-${hoursAgo}h`;
  }

  private escapeJqlValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  async searchRecentIssues(projectKey: string, sinceIso: string): Promise<JiraIssue[]> {
    const updatedFilter = this.getRelativeUpdatedFilter(sinceIso);
    const escapedProjectKey = this.escapeJqlValue(projectKey);
    const jql = `project = "${escapedProjectKey}" AND key ~ "${escapedProjectKey}-" AND updated >= ${updatedFilter} ORDER BY created DESC`;
    const primaryUrl = `${this.baseUrl}/rest/api/3/search/jql`;
    const fallbackUrl = `${this.baseUrl}/rest/api/3/search`;
    let res = await this.search(primaryUrl, jql);

    if (res.status === 404 || res.status === 405) {
      res = await this.search(fallbackUrl, jql);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jira API error: ${res.status} ${res.statusText} ${text}`.trim());
    }

    const data = (await res.json()) as {
      issues?: Array<{
        key: string;
        fields?: {
          summary?: string;
          created?: string;
          updated?: string;
        };
      }>;
    };

    const issues = Array.isArray(data.issues) ? data.issues : [];
    return issues
      .filter((issue) => !!issue.key && !!issue.fields?.summary && !!issue.fields?.created && !!issue.fields?.updated)
      .map((issue) => ({
        key: issue.key,
        summary: issue.fields!.summary!,
        created: issue.fields!.created!,
        updated: issue.fields!.updated!,
        url: `${this.baseUrl}/browse/${issue.key}`
      }));
  }
}
