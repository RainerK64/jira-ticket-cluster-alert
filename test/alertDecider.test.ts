import test from "node:test";
import assert from "node:assert/strict";
import { getNewIssueKeys, shouldAlertCluster } from "../src/main/alertDecider";
import { IssueCluster, StoredIssue } from "../src/shared/types";
import { normalizeSummary } from "../src/main/matcher";

function createIssue(key: string): StoredIssue {
  return {
    key,
    summary: "Cannot log into portal",
    normalizedSummary: normalizeSummary("Cannot log into portal"),
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    lastSeenAt: "2026-09-09T00:00:00.000Z",
    url: `https://example.atlassian.net/browse/${key}`,
  };
}

function createCluster(keys: string[]): IssueCluster {
  return {
    signature: "portal|login",
    representativeSummary: "Cannot log into portal",
    issues: keys.map(createIssue),
    similarityScore: 0.9,
  };
}

test("shouldAlertCluster only repeats when new matching tickets appear", () => {
  const cluster = createCluster(["IT-1", "IT-2", "IT-3"]);
  assert.equal(shouldAlertCluster(cluster, 3), true);

  const previousAlert = {
    clusterSignature: "portal|login",
    representativeSummary: "Cannot log into portal",
    issueKeys: ["IT-1", "IT-2", "IT-3"],
    ticketCount: 3,
    newestIssueCreatedAt: "2026-09-09T00:00:00.000Z",
    alertedAt: "2026-09-09T00:05:00.000Z",
  };

  assert.equal(shouldAlertCluster(cluster, 3, previousAlert), false);
  assert.deepEqual(getNewIssueKeys(createCluster(["IT-1", "IT-2", "IT-3", "IT-4"]), previousAlert), ["IT-4"]);
  assert.equal(shouldAlertCluster(createCluster(["IT-1", "IT-2", "IT-3", "IT-4"]), 3, previousAlert), true);
});
