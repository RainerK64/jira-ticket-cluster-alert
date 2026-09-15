import { isOnOrAfterIso } from '../shared/utils';
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

  private formatRelativeUpdatedFilter(sinceIso: string): string {
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

  private mapIssues(data: {
    issues?: Array<{
      key: string;
      fields?: {
        summary?: string;
        created?: string;
        updated?: string;
      };
    }>;
  }): JiraIssue[] {
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

  private async fetchIssuesWithJql(jql: string): Promise<JiraIssue[]> {
    const maxResults = 100;
    const strategies = [
      {
        run: (startAt: number) => this.searchWithPost(`${this.baseUrl}/rest/api/3/search`, jql, startAt, maxResults)
      },
      {
        run: (startAt: number) => this.searchWithGet(`${this.baseUrl}/rest/api/3/search/jql`, jql, startAt, maxResults)
      }
    ];
    let lastError: Error | null = null;
    let sawSuccessfulResponse = false;

    for (const strategy of strategies) {
      const collectedIssues: JiraIssue[] = [];
      let startAt = 0;
      let total = Infinity;

      while (startAt < total) {
        const res = await strategy.run(startAt);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          lastError = new Error(`Jira API error: ${res.status} ${res.statusText} ${text}`.trim());
          break;
        }

        sawSuccessfulResponse = true;
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

        const rawIssueCount = Array.isArray(data.issues) ? data.issues.length : 0;
        const issues = this.mapIssues(data);
        collectedIssues.push(...issues);

        total = Number.isFinite(data.total) ? Number(data.total) : rawIssueCount;
        const pageSize = Number.isFinite(data.maxResults) && Number(data.maxResults) > 0 ? Number(data.maxResults) : maxResults;
        const nextStartAt = (Number.isFinite(data.startAt) ? Number(data.startAt) : startAt) + rawIssueCount;

        if (!rawIssueCount || nextStartAt <= startAt) {
          break;
        }

        startAt = nextStartAt;
        if (rawIssueCount < pageSize) {
          break;
        }
      }

      if (collectedIssues.length > 0) {
        return collectedIssues;
      }
    }

    if (!sawSuccessfulResponse && lastError) {
      throw lastError;
    }

    return [];
  }

  async searchRecentIssues(projectKey: string, sinceIso: string): Promise<JiraIssue[]> {
    const escapedProjectKey = this.escapeJqlValue(projectKey);
    const absoluteUpdatedFilter = this.formatJqlDateTime(sinceIso);
    const relativeUpdatedFilter = this.formatRelativeUpdatedFilter(sinceIso);
    const absoluteJql = `project = "${escapedProjectKey}" AND updated >= "${absoluteUpdatedFilter}" ORDER BY updated DESC`;
    const relativeJql = `project = "${escapedProjectKey}" AND updated >= ${relativeUpdatedFilter} ORDER BY updated DESC`;
    const projectOnlyJql = `project = "${escapedProjectKey}" ORDER BY updated DESC`;
    const absoluteIssues = await this.fetchIssuesWithJql(absoluteJql);

    if (absoluteIssues.length > 0) {
      return absoluteIssues;
    }

    const relativeIssues = await this.fetchIssuesWithJql(relativeJql);
    if (relativeIssues.length > 0) {
      return relativeIssues;
    }

    return (await this.fetchIssuesWithJql(projectOnlyJql))
      .filter((issue) => isOnOrAfterIso(issue.updated, sinceIso));
  }
}
