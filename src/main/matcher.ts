import { AlertCluster, StoredIssue } from '../shared/types';
import { makeClusterId, normalizeSummary, nowIso, tokenizeSummary, uniqueSorted, wordOverlapScore } from '../shared/utils';

export function combinedSimilarity(a: StoredIssue, b: StoredIssue): number {
  if (a.summaryNormalized === b.summaryNormalized) return 1;

  const tokensA = a.summaryTokens ?? tokenizeSummary(a.summary);
  const tokensB = b.summaryTokens ?? tokenizeSummary(b.summary);
  const overlap = wordOverlapScore(tokensA, tokensB);
  const sharedWords = tokensA.filter((t) => tokensB.includes(t)).length;
  const coverage = sharedWords / Math.max(1, Math.min(tokensA.length, tokensB.length));

  const lenRatio = Math.min(tokensA.length, tokensB.length) / Math.max(tokensA.length || 1, tokensB.length || 1);
  const firstWordsMatch = tokensA[0] && tokensB[0] && tokensA[0] === tokensB[0] ? 0.1 : 0;

  return Math.max(0, Math.min(1, (overlap * 0.45) + (coverage * 0.35) + (lenRatio * 0.1) + firstWordsMatch));
}

type MatchGroup = {
  signature: string;
  issues: StoredIssue[];
  score: number;
};

function clusterScore(issues: StoredIssue[]): number {
  if (issues.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      total += combinedSimilarity(issues[i], issues[j]);
      pairs++;
    }
  }
  return pairs ? total / pairs : 0;
}

export function buildClusters(issues: StoredIssue[], threshold: number): MatchGroup[] {
  const remaining = [...issues];
  const groups: MatchGroup[] = [];

  while (remaining.length > 0) {
    const base = remaining.shift()!;
    const clustered: StoredIssue[] = [base];

    for (let i = remaining.length - 1; i >= 0; i--) {
      if (combinedSimilarity(base, remaining[i]) >= threshold) {
        clustered.push(remaining[i]);
        remaining.splice(i, 1);
      }
    }

    if (clustered.length >= 3) {
      groups.push({
        signature: normalizeSummary(clustered.map((i) => i.summary).join(' ')),
        issues: clustered,
        score: clusterScore(clustered)
      });
    }
  }

  return groups;
}

export function createAlertFromGroup(group: MatchGroup): AlertCluster {
  const issueKeys = group.issues.map((i) => i.key);
  const summaries = group.issues.map((i) => i.summary);
  const createdTimes = group.issues.map((i) => i.created).sort();

  return {
    id: makeClusterId(group.signature),
    signature: group.signature,
    count: group.issues.length,
    issueKeys: uniqueSorted(issueKeys),
    summaries,
    firstSeenAt: createdTimes[0] ?? nowIso(),
    lastSeenAt: createdTimes.at(-1) ?? nowIso(),
    score: group.score
  };
}
