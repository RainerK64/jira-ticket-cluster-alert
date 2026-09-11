import { JiraClient } from './jiraClient';
import { buildClusters, createAlertFromGroup } from './matcher';
import { getAlertById, getStoredIssues, saveAlert, saveIssues, updateStatus, getStatus } from './storage';
import { hoursAgoIso, isOnOrAfterIso, minutesFromNowIso, normalizeSummary, tokenizeSummary } from '../shared/utils';
import { StoredIssue } from '../shared/types';
import { showPopup, logHeartbeat } from './alertService';

export async function runWatcher(
  jira: JiraClient,
  projectKey: string,
  similarityThreshold: number,
  alertWindowHours: number,
  pollIntervalSeconds: number
): Promise<void> {
  const startedPoll = new Date().toISOString();
  updateStatus({ lastPollAt: startedPoll, nextPollAt: minutesFromNowIso(Math.ceil(pollIntervalSeconds / 60)) });

  const sinceIso = hoursAgoIso(alertWindowHours);
  const issues = await jira.searchRecentIssues(projectKey, sinceIso);
  console.log(`[watcher] fetched ${issues.length} recent issues from project ${projectKey}`);

  const storedIssues = getStoredIssues();
  const existingKeys = new Set(storedIssues.map((issue) => issue.key));
  const issuesToSave: StoredIssue[] = issues.map((issue) => ({
    ...issue,
    summaryNormalized: normalizeSummary(issue.summary),
    summaryTokens: tokenizeSummary(issue.summary)
  }));

  let newIssues = 0;
  for (const issue of issues) {
    if (!existingKeys.has(issue.key)) {
      newIssues++;
    }
  }

  saveIssues(issuesToSave);

  const allIssues: StoredIssue[] = getStoredIssues().filter((issue) => isOnOrAfterIso(issue.updated, sinceIso));
  const groups = buildClusters(allIssues, similarityThreshold);
  console.log(`[watcher] ${allIssues.length} stored issues in alert window, ${groups.length} matching clusters found`);
  let alertsSent = 0;

  for (const group of groups) {
    const alert = createAlertFromGroup(group);
    const existingAlert = getAlertById(alert.id);

    if (!existingAlert || existingAlert.count < alert.count || existingAlert.score < alert.score) {
      saveAlert(alert);
      alertsSent++;
      showPopup(alert, getStatus());
    }
  }

  updateStatus({
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
    nextPollAt: new Date(Date.now() + pollIntervalSeconds * 1000).toISOString(),
    ticketsSeen: getStatus().ticketsSeen + newIssues,
    alertsSent: getStatus().alertsSent + alertsSent
  });

  logHeartbeat(getStatus(), pollIntervalSeconds);
}
