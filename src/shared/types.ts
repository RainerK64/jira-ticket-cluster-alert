export interface JiraIssue {
  key: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface StoredIssue extends JiraIssue {
  normalizedSummary: string;
  lastSeenAt: string;
}

export interface IssueCluster {
  signature: string;
  representativeSummary: string;
  issues: StoredIssue[];
  similarityScore: number;
}

export interface AlertRecord {
  id?: number;
  clusterSignature: string;
  representativeSummary: string;
  issueKeys: string[];
  ticketCount: number;
  newestIssueCreatedAt: string;
  alertedAt: string;
}

export interface StatusCluster {
  signature: string;
  representativeSummary: string;
  ticketKeys: string[];
  ticketCount: number;
}

export interface AppStatusSnapshot {
  configured: boolean;
  running: boolean;
  jiraProjectKey: string;
  pollIntervalSeconds: number;
  similarityThreshold: number;
  alertWindowHours: number;
  clusterThreshold: number;
  databasePath: string;
  lastPollAt?: string;
  lastError?: string;
  lastPollSummary?: string;
  totalRecentIssues: number;
  currentClusters: StatusCluster[];
  recentAlerts: AlertRecord[];
}
