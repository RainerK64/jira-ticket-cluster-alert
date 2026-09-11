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

  private async searchWithPost(url: string, jql: string, startAt: number, maxResults: number): Promise<Response> {
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
        startAt,
        maxResults,
        fields: ['summary', 'created', 'updated']
      })
    });
  }

  private async searchWithGet(url: string, jql: string, startAt: number, maxResults: number): Promise<Response> {
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: String(maxResults),
      fields: 'summary,created,updated'
    });

    return fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json'
      }
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
    const primaryUrl = `${this.baseUrl}/rest/api/3/search`;
    const fallbackUrl = `${this.baseUrl}/rest/api/3/search/jql`;
    const maxResults = 100;
    const issueKeyPrefix = `${projectKey.toUpperCase()}-`;
    const collectedIssues: JiraIssue[] = [];
    let startAt = 0;
    let total = Infinity;

    while (startAt < total) {
      let res = await this.searchWithPost(primaryUrl, jql, startAt, maxResults);

      if (res.status === 404 || res.status === 405 || res.status === 410) {
        res = await this.searchWithGet(fallbackUrl, jql, startAt, maxResults);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Jira API error: ${res.status} ${res.statusText} ${text}`.trim());
      }

      const data = (await res.json()) as {
        startAt?: number;
        maxResults?: number;
        total?: number;
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
      collectedIssues.push(...issues
        .filter((issue) => !!issue.key && !!issue.fields?.summary && !!issue.fields?.created && !!issue.fields?.updated)
        .filter((issue) => issue.key.toUpperCase().startsWith(issueKeyPrefix))
        .map((issue) => ({
          key: issue.key,
          summary: issue.fields!.summary!,
          created: issue.fields!.created!,
          updated: issue.fields!.updated!,
          url: `${this.baseUrl}/browse/${issue.key}`
        })));

      total = Number.isFinite(data.total) ? Number(data.total) : issues.length;
      const pageSize = Number.isFinite(data.maxResults) && Number(data.maxResults) > 0 ? Number(data.maxResults) : maxResults;
      const nextStartAt = (Number.isFinite(data.startAt) ? Number(data.startAt) : startAt) + issues.length;

      if (!issues.length || nextStartAt <= startAt) {
        break;
      }

      startAt = nextStartAt;
      if (issues.length < pageSize) {
        break;
      }
    }

    return collectedIssues;
  }
}
