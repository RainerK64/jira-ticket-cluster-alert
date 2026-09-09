import { AppConfig } from "./config";
import { JiraClient } from "./jiraClient";
import { Storage } from "./storage";
import { clusterIssues } from "./matcher";
import { AlertService } from "./alertService";
import { AppStatusSnapshot, IssueCluster } from "../shared/types";
import { shouldAlertCluster } from "./alertDecider";

export class TicketWatcher {
  private timer?: NodeJS.Timeout;
  private isPolling = false;
  private status: AppStatusSnapshot;

  constructor(
    private readonly config: AppConfig,
    private readonly jiraClient: JiraClient,
    private readonly storage: Storage,
    private readonly alertService: AlertService,
    private readonly onStatusChange: (status: AppStatusSnapshot) => void,
  ) {
    this.status = {
      configured: true,
      running: false,
      jiraProjectKey: this.config.jira.projectKey,
      pollIntervalSeconds: this.config.polling.intervalMs / 1_000,
      similarityThreshold: this.config.alerting.similarityThreshold,
      alertWindowHours: this.config.alerting.windowHours,
      clusterThreshold: this.config.alerting.clusterThreshold,
      databasePath: this.config.storage.databasePath,
      totalRecentIssues: 0,
      currentClusters: [],
      recentAlerts: [],
    };
  }

  getStatus(): AppStatusSnapshot {
    return this.status;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.status = { ...this.status, running: true };
    this.pushStatus();
    void this.pollNow();
    this.timer = setInterval(() => {
      void this.pollNow();
    }, this.config.polling.intervalMs);
  }

  private pushStatus(): void {
    this.onStatusChange(this.status);
  }

  private windowStartIso(): string {
    const start = new Date(Date.now() - this.config.alerting.windowHours * 60 * 60 * 1_000);
    return start.toISOString();
  }

  private formatClusters(clusters: IssueCluster[]) {
    return clusters.map((cluster) => ({
      signature: cluster.signature,
      representativeSummary: cluster.representativeSummary,
      ticketKeys: cluster.issues.map((issue) => issue.key),
      ticketCount: cluster.issues.length,
    }));
  }

  async pollNow(): Promise<void> {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const fetchedIssues = await this.jiraClient.fetchRelevantIssues();
      this.storage.saveIssues(fetchedIssues);

      const recentIssues = this.storage.getRecentIssues(this.windowStartIso());
      const matchedClusters = clusterIssues(
        recentIssues,
        this.config.alerting.similarityThreshold,
      ).filter((cluster) => cluster.issues.length >= this.config.alerting.clusterThreshold);

      for (const cluster of matchedClusters) {
        const previousAlert = this.storage.getLatestAlertForCluster(cluster.signature);
        if (!shouldAlertCluster(cluster, this.config.alerting.clusterThreshold, previousAlert)) {
          continue;
        }

        const alertRecord = {
          clusterSignature: cluster.signature,
          representativeSummary: cluster.representativeSummary,
          issueKeys: cluster.issues.map((issue) => issue.key),
          ticketCount: cluster.issues.length,
          newestIssueCreatedAt:
            cluster.issues[cluster.issues.length - 1]?.createdAt || new Date().toISOString(),
          alertedAt: new Date().toISOString(),
        };

        this.storage.recordAlert(alertRecord);
        this.alertService.notifyCluster(cluster);
      }

      this.status = {
        ...this.status,
        running: true,
        lastPollAt: new Date().toISOString(),
        lastError: undefined,
        lastPollSummary: `Fetched ${fetchedIssues.length} Jira issues and found ${matchedClusters.length} active cluster(s).`,
        totalRecentIssues: recentIssues.length,
        currentClusters: this.formatClusters(matchedClusters),
        recentAlerts: this.storage.getRecentAlerts(10),
      };
    } catch (error) {
      this.status = {
        ...this.status,
        running: true,
        lastPollAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "Unknown polling error",
        recentAlerts: this.storage.getRecentAlerts(10),
      };
    } finally {
      this.isPolling = false;
      this.pushStatus();
    }
  }
}
