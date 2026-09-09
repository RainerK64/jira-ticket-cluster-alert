import { AlertRecord, AppStatusSnapshot, StatusCluster } from "../shared/types";

declare global {
  interface Window {
    appStatus: {
      getStatus(): Promise<AppStatusSnapshot>;
      onUpdate(listener: (status: AppStatusSnapshot) => void): void;
    };
  }
}

function createListCard(title: string, lines: string[], className: string): HTMLElement {
  const wrapper = document.createElement("article");
  wrapper.className = className;

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrapper.appendChild(heading);

  for (const line of lines) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    wrapper.appendChild(paragraph);
  }

  return wrapper;
}

function renderClusters(clusters: StatusCluster[]): void {
  const container = document.getElementById("clusters");
  if (!container) {
    return;
  }

  container.replaceChildren();
  if (clusters.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No active 3+ ticket clusters in the current alert window.";
    container.appendChild(empty);
    return;
  }

  for (const cluster of clusters) {
    container.appendChild(
      createListCard(
        `${cluster.ticketCount} tickets — ${cluster.representativeSummary}`,
        [`Keys: ${cluster.ticketKeys.join(", ")}`, `Cluster signature: ${cluster.signature}`],
        "cluster-card",
      ),
    );
  }
}

function renderAlerts(alerts: AlertRecord[]): void {
  const container = document.getElementById("alerts");
  if (!container) {
    return;
  }

  container.replaceChildren();
  if (alerts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No alerts have been triggered yet.";
    container.appendChild(empty);
    return;
  }

  for (const alert of alerts) {
    container.appendChild(
      createListCard(
        `${alert.ticketCount} tickets alerted at ${new Date(alert.alertedAt).toLocaleString()}`,
        [
          alert.representativeSummary,
          `Keys: ${alert.issueKeys.join(", ")}`,
          `Latest ticket time: ${new Date(alert.newestIssueCreatedAt).toLocaleString()}`,
        ],
        "alert-card",
      ),
    );
  }
}

function updateStatusGrid(status: AppStatusSnapshot): void {
  const grid = document.getElementById("status-grid");
  const error = document.getElementById("last-error");
  if (!grid || !error) {
    return;
  }

  const rows: Array<[string, string]> = [
    ["Configured", status.configured ? "Yes" : "No"],
    ["Running", status.running ? "Yes" : "No"],
    ["Jira project key", status.jiraProjectKey],
    ["Poll interval", `${status.pollIntervalSeconds} seconds`],
    ["Similarity threshold", String(status.similarityThreshold)],
    ["Alert window", `${status.alertWindowHours} hours`],
    ["Cluster threshold", String(status.clusterThreshold)],
    ["Database", status.databasePath],
    ["Last poll", status.lastPollAt ? new Date(status.lastPollAt).toLocaleString() : "Not yet"],
    ["Recent IT tickets in window", String(status.totalRecentIssues)],
    ["Last poll summary", status.lastPollSummary || "Waiting for first poll..."],
  ];

  grid.replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    grid.appendChild(term);
    grid.appendChild(description);
  }

  error.textContent = status.lastError || "";
}

function render(status: AppStatusSnapshot): void {
  updateStatusGrid(status);
  renderClusters(status.currentClusters);
  renderAlerts(status.recentAlerts);
}

window.addEventListener("DOMContentLoaded", async () => {
  render(await window.appStatus.getStatus());
  window.appStatus.onUpdate(render);
});
