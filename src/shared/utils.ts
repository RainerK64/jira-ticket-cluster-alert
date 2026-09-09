const STOPWORDS = new Set([
  'the','a','an','and','or','to','for','in','on','of','with','by','is','are','was','were','be','been','being',
  'cannot',"can't",'unable','issue','problem','error','ticket','request','please'
]);

export function normalizeSummary(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^"]?/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSummary(summary: string): string[] {
  return normalizeSummary(summary)
    .split(' ')
    .map((token) => token.trim())
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
