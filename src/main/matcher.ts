import { AlertCluster, StoredIssue } from '../shared/types';
import { commonTopicScore, diceCoefficient, makeClusterId, normalizeSummary, nowIso, tokenizeSummary, wordOverlapScore } from '../shared/utils';

export function combinedSimilarity(a: StoredIssue, b: StoredIssue): number {
  if (a.summaryNormalized === b.summaryNormalized) return 1;

  const tokensA = a.summaryTokens ?? tokenizeSummary(a.summary);
  const tokensB = b.summaryTokens ?? tokenizeSummary(b.summary);
  const overlap = wordOverlapScore(tokensA, tokensB);
  const sharedWords = tokensA.filter((t) => tokensB.includes(t)).length;
  const coverage = sharedWords / Math.max(1, Math.min(tokensA.length, tokensB.length));
  const phraseSimilarity = diceCoefficient(a.summaryNormalized, b.summaryNormalized);
  const topicScore = commonTopicScore(tokensA, tokensB);
  const lenRatio = Math.min(tokensA.length, tokensB.length) / Math.max(tokensA.length || 1, tokensB.length || 1);
  const firstWordsMatch = tokensA[0] && tokensB[0] && tokensA[0] === tokensB[0] ? 0.1 : 0;

  return Math.max(0, Math.min(1, (overlap * 0.25) + (coverage * 0.2) + (phraseSimilarity * 0.2) + (topicScore * 0.25) + (lenRatio * 0.05) + firstWordsMatch));
}

function isClusterMatch(a: StoredIssue, b: StoredIssue, threshold: number): boolean {
  const tokensA = a.summaryTokens ?? tokenizeSummary(a.summary);
  const tokensB = b.summaryTokens ?? tokenizeSummary(b.summary);
  const similarity = combinedSimilarity(a, b);
  const topicScore = commonTopicScore(tokensA, tokensB);
  const relaxedThreshold = Math.max(0.45, threshold - 0.27);

  return similarity >= threshold || (topicScore >= 0.35 && similarity >= relaxedThreshold);
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
    const clustered: StoredIssue[] = [remaining.shift()!];

    for (let queueIndex = 0; queueIndex < clustered.length; queueIndex++) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (isClusterMatch(clustered[queueIndex], remaining[i], threshold)) {
          clustered.push(remaining[i]);
          remaining.splice(i, 1);
        }
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
  const orderedIssues = [...group.issues].sort((a, b) => {
    const createdTimeDiff = new Date(a.created).getTime() - new Date(b.created).getTime();
    return createdTimeDiff || a.key.localeCompare(b.key);
  });
  const issueKeys = orderedIssues.map((i) => i.key);
  const summaries = orderedIssues.map((i) => i.summary);
  const createdTimes = orderedIssues.map((i) => i.created).sort();

  return {
    id: makeClusterId(group.signature),
    signature: group.signature,
    count: orderedIssues.length,
    issueKeys,
    summaries,
    firstSeenAt: createdTimes[0] ?? nowIso(),
    lastSeenAt: createdTimes.at(-1) ?? nowIso(),
    score: group.score
  };
}
