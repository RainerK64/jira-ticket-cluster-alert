import Fuse from 'fuse.js';
import { AlertCluster, StoredIssue } from '../shared/types';
import { makeClusterId, normalizeSummary, tokenizeSummary, uniqueSorted, wordOverlapScore, nowIso } from '../shared/utils';

type MatchGroup = {
  signature: string;
  issues: StoredIssue[];
  score: number;
};

function combinedSimilarity(a: StoredIssue, b: StoredIssue): number {
  if (a.summaryNormalized === b.summaryNormalized) return 1;

  const exactTokens = a.summaryTokens.length === b.summaryTokens.length &&
    a.summaryTokens.every((t, idx) => t === b.summaryTokens[idx]);
  if (exactTokens) return 0.99;

  const base = [a.summaryNormalized, b.summaryNormalized];
  const fuse = new Fuse(base, { includeScore: true, threshold: 0.5 });
  const fuseScore = 1 - (fuse.search(a.summaryNormalized)[0]?.score ?? 1);

  const overlap = wordOverlapScore(a.summaryTokens, b.summaryTokens);
  const lenPenalty = Math.min(a.summaryTokens.length, b.summaryTokens.length) / Math.max(a.summaryTokens.length, b.summaryTokens.length);

  return Math.max(0, (fuseScore * 0.55) + (overlap * 0.35) + (lenPenalty * 0.10));
}

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
      const candidate = remaining[i];
      if (combinedSimilarity(base, candidate) >= threshold) {
        clustered.push(candidate);
        remaining.splice(i, 1);
      }
    }

    if (clustered.length >= 3) {
      const score = clusterScore(clustered);
      groups.push({
        signature: normalizeSummary(clustered.map((i) => i.summary).join(' ')),
        issues: clustered,
        score
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
