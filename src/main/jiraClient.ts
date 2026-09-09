import { AppConfig } from "./config";
import { JiraIssue } from "../shared/types";

interface JiraSearchResult {
  issues?: Array<{
    key: string;
    self?: string;
    fields?: {
      summary?: string;
      created?: string;
      updated?: string;
    };
  }>;
}

export class JiraClient {
  constructor(private readonly config: AppConfig) {}

  private async request<TResponse>(pathname: string, body: unknown): Promise<TResponse> {
    const url = new URL(pathname, `${this.config.jira.baseUrl}/`);
    const authHeader = Buffer.from(
      `${this.config.jira.email}:${this.config.jira.apiToken}`,
      "utf8",
    ).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.jira.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira request failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    return (await response.json()) as TResponse;
  }

  async fetchRelevantIssues(): Promise<JiraIssue[]> {
    const jql = [
      `project = "${this.config.jira.projectKey}"`,
      `created >= -${this.config.alerting.windowHours}h`,
      "summary is not EMPTY",
      "ORDER BY created DESC",
    ].join(" AND ");

    const payload = {
      jql,
      maxResults: this.config.jira.maxResults,
      fields: ["summary", "created", "updated"],
    };

    const response = await this.request<JiraSearchResult>(this.config.jira.endpoints.search, payload);
    const issuePrefix = `${this.config.jira.projectKey}-`;

    return (response.issues || [])
      .filter((issue) => issue.key.startsWith(issuePrefix) && issue.fields?.summary)
      .map((issue) => ({
        key: issue.key,
        summary: issue.fields?.summary?.trim() || "",
        createdAt: issue.fields?.created || new Date().toISOString(),
        updatedAt: issue.fields?.updated || issue.fields?.created || new Date().toISOString(),
        url: `${this.config.jira.baseUrl}/browse/${issue.key}`,
      }));
  }
}
