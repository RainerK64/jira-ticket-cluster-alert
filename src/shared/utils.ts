const STOPWORDS = new Set([
  'the','a','an','and','or','to','for','in','on','of','with','by','is','are','was','were','be','been','being',
  'cannot','cant','unable','issue','problem','error','ticket','request','please'
]);

export function normalizeSummary(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSummary(summary: string): string[] {
  return normalizeSummary(summary)
    .split(' ')
    .map((token) => token.trim())
    .map((token) => token
      .replace(/^\d+/, '')
      .replace(/\d+$/, '')
      .replace(/(ing|ed|es|s)$/i, ''))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function minutesFromNowIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function makeClusterId(signature: string): string {
  return signature
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function wordOverlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const token of setA) {
    if (setB.has(token)) common++;
  }
  return common / Math.max(setA.size, setB.size);
}

export function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const pairs = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const pair = b.slice(i, i + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      pairs.set(pair, count - 1);
      matches++;
    }
  }

  return (2 * matches) / ((a.length - 1) + (b.length - 1));
}
