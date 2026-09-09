import { IssueCluster, StoredIssue } from "../shared/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const TOKEN_SYNONYMS = new Map<string, string>([
  ["unable", "cannot"],
  ["cant", "cannot"],
  ["failed", "failure"],
  ["failing", "failure"],
  ["fails", "failure"],
]);

export function normalizeSummary(summary: string): string {
  return summary
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\blog[\s-]*in(?:to)?\b/g, " login ")
    .replace(/\bsign[\s-]*in\b/g, " login ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeToken(token: string): string {
  let normalized = TOKEN_SYNONYMS.get(token) || token;

  if (normalized.endsWith("ing") && normalized.length > 5) {
    normalized = normalized.slice(0, -3);
  } else if (normalized.endsWith("ed") && normalized.length > 4) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith("es") && normalized.length > 4) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith("s") && normalized.length > 3) {
    normalized = normalized.slice(0, -1);
  }

  return TOKEN_SYNONYMS.get(normalized) || normalized;
}

function tokenize(summary: string): string[] {
  return normalizeSummary(summary)
    .split(" ")
    .map(canonicalizeToken)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function buildBigrams(text: string): Set<string> {
  const normalized = normalizeSummary(text).replace(/\s+/g, " ");
  if (normalized.length < 2) {
    return new Set(normalized ? [normalized] : []);
  }

  const bigrams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.add(normalized.slice(index, index + 2));
  }
  return bigrams;
}

function jaccardSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) {
    return 1;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersectionCount = [...leftSet].filter((token) => rightSet.has(token)).length;
  const unionCount = new Set([...leftSet, ...rightSet]).size;

  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

function containmentSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersectionCount = [...leftSet].filter((token) => rightSet.has(token)).length;
  const smallestSetSize = Math.min(leftSet.size, rightSet.size);

  return smallestSetSize === 0 ? 0 : intersectionCount / smallestSetSize;
}

function diceSimilarity(left: string, right: string): number {
  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);

  if (leftBigrams.size === 0 && rightBigrams.size === 0) {
    return 1;
  }

  const overlap = [...leftBigrams].filter((bigram) => rightBigrams.has(bigram)).length;
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

export function calculateSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeSummary(left);
  const normalizedRight = normalizeSummary(right);

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const leftTokens = tokenize(normalizedLeft);
  const rightTokens = tokenize(normalizedRight);
  const tokenScore = jaccardSimilarity(leftTokens, rightTokens);
  const containmentScore = containmentSimilarity(leftTokens, rightTokens);
  const diceScore = diceSimilarity(normalizedLeft, normalizedRight);
  const containmentBonus =
    normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft) ? 0.1 : 0;

  return Math.min(
    1,
    tokenScore * 0.35 + containmentScore * 0.3 + diceScore * 0.35 + containmentBonus,
  );
}

function averageSimilarity(issue: StoredIssue, issues: StoredIssue[]): number {
  if (issues.length <= 1) {
    return 1;
  }

  const sum = issues.reduce((total, otherIssue) => {
    if (otherIssue.key === issue.key) {
      return total;
    }
    return total + calculateSimilarity(issue.summary, otherIssue.summary);
  }, 0);

  return sum / (issues.length - 1);
}

function createSignature(issues: StoredIssue[]): string {
  const tokenCounts = new Map<string, number>();
  for (const issue of issues) {
    for (const token of tokenize(issue.summary).filter((value) => value.length > 2)) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  }

  const topTokens = [...tokenCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([token]) => token);

  if (topTokens.length === 0) {
    return issues.map((issue) => issue.normalizedSummary).sort()[0] || "cluster";
  }

  return topTokens.join("|");
}

export function clusterIssues(issues: StoredIssue[], threshold: number): IssueCluster[] {
  if (issues.length === 0) {
    return [];
  }

  const parent = new Map<string, string>(issues.map((issue) => [issue.key, issue.key]));

  const find = (key: string): string => {
    const currentParent = parent.get(key);
    if (!currentParent || currentParent === key) {
      return key;
    }
    const root = find(currentParent);
    parent.set(key, root);
    return root;
  };

  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };

  for (let leftIndex = 0; leftIndex < issues.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < issues.length; rightIndex += 1) {
      const similarity = calculateSimilarity(issues[leftIndex].summary, issues[rightIndex].summary);
      if (similarity >= threshold) {
        union(issues[leftIndex].key, issues[rightIndex].key);
      }
    }
  }

  const grouped = new Map<string, StoredIssue[]>();
  for (const issue of issues) {
    const key = find(issue.key);
    const group = grouped.get(key) || [];
    group.push(issue);
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .map((group) => {
      const representative = [...group].sort(
        (left, right) => averageSimilarity(right, group) - averageSimilarity(left, group),
      )[0];
      const averageScore = averageSimilarity(representative, group);

      return {
        signature: createSignature(group),
        representativeSummary: representative.summary,
        issues: group.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
        similarityScore: Number(averageScore.toFixed(2)),
      };
    })
    .sort((left, right) => right.issues.length - left.issues.length);
}
