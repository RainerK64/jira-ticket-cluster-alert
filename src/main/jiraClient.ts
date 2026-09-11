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

  private formatJqlDateTime(sinceIso: string): string {
    const isoMatch = sinceIso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
    if (isoMatch) {
      const [, datePart, timePart, offsetPart] = isoMatch;
      const normalizedOffset = offsetPart === 'Z' ? '+0000' : offsetPart.replace(':', '');
      return `${datePart} ${timePart} ${normalizedOffset}`;
    }

    const date = new Date(sinceIso);
    if (!Number.isFinite(date.getTime())) {
      return '1970-01-01 00:00 +0000';
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes} +0000`;
  }

  private escapeJqlValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  async searchRecentIssues(projectKey: string, sinceIso: string): Promise<JiraIssue[]> {
    const updatedFilter = this.formatJqlDateTime(sinceIso);
    const escapedProjectKey = this.escapeJqlValue(projectKey);
    const jql = `project = "${escapedProjectKey}" AND updated >= "${updatedFilter}" ORDER BY created DESC`;
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
