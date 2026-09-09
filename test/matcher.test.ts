import test from "node:test";
import assert from "node:assert/strict";
import { calculateSimilarity, clusterIssues, normalizeSummary } from "../src/main/matcher";
import { StoredIssue } from "../src/shared/types";

function issue(key: string, summary: string, createdAt: string): StoredIssue {
  return {
    key,
    summary,
    normalizedSummary: normalizeSummary(summary),
    createdAt,
    updatedAt: createdAt,
    lastSeenAt: createdAt,
    url: `https://example.atlassian.net/browse/${key}`,
  };
}

test("calculateSimilarity scores close summaries higher than unrelated ones", () => {
  const related = calculateSimilarity("Cannot log into portal", "Unable to login to portal");
  const unrelated = calculateSimilarity("Cannot log into portal", "Printer toner is empty");

  assert.ok(related > 0.55, `expected related score > 0.55, got ${related}`);
  assert.ok(unrelated < 0.55, `expected unrelated score < 0.55, got ${unrelated}`);
});

test("clusterIssues groups similar Jira summaries together", () => {
  const clusters = clusterIssues(
    [
      issue("IT-101", "Cannot log into portal", "2026-09-09T00:00:00.000Z"),
      issue("IT-102", "Unable to login to portal", "2026-09-09T00:01:00.000Z"),
      issue("IT-103", "Portal login failure", "2026-09-09T00:02:00.000Z"),
      issue("IT-200", "Laptop screen is flickering", "2026-09-09T00:03:00.000Z"),
    ],
    0.55,
  );

  assert.equal(clusters[0]?.issues.length, 3);
  assert.deepEqual(
    clusters[0]?.issues.map((entry) => entry.key),
    ["IT-101", "IT-102", "IT-103"],
  );
});

test("cluster signature stays stable when a new matching ticket arrives", () => {
  const firstSignature = clusterIssues(
    [
      issue("IT-101", "Cannot log into portal", "2026-09-09T00:00:00.000Z"),
      issue("IT-102", "Unable to login to portal", "2026-09-09T00:01:00.000Z"),
      issue("IT-103", "Portal login failure", "2026-09-09T00:02:00.000Z"),
    ],
    0.55,
  )[0]?.signature;

  const secondSignature = clusterIssues(
    [
      issue("IT-101", "Cannot log into portal", "2026-09-09T00:00:00.000Z"),
      issue("IT-102", "Unable to login to portal", "2026-09-09T00:01:00.000Z"),
      issue("IT-103", "Portal login failure", "2026-09-09T00:02:00.000Z"),
      issue("IT-104", "Users unable to log in to portal", "2026-09-09T00:03:00.000Z"),
    ],
    0.55,
  )[0]?.signature;

  assert.equal(firstSignature, secondSignature);
});
