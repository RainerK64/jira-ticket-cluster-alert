export type JiraIssue = {
  key: string;
  summary: string;
  created: string;
  updated: string;
  url: string;
};

export type StoredIssue = JiraIssue & {
  summaryNormalized: string;
  summaryTokens: string[];
};

export type AlertCluster = {
  id: string;
  signature: string;
  count: number;
  issueKeys: string[];
  summaries: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  score: number;
};

export type AppStatus = {
  running: boolean;
  startedAt: string;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextPollAt: string | null;
  ticketsSeen: number;
  alertsSent: number;
};
