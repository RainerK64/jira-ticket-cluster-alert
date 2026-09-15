const STOPWORDS = new Set([
  'the','a','an','and','or','to','for','in','on','of','with','by','is','are','was','were','be','been','being',
  'cannot','cant','unable','issue','problem','error','ticket','request','please','need','help',
  'och','og','eller','med','utan','uten','som','att','det','den','kan','hjelp','snalla','inn'
]);

const TOKEN_ALIASES = new Map<string, string>([
  ['appen', 'app'],
  ['applikasjon', 'app'],
  ['applikation', 'app'],
  ['autentisering', 'authenticator'],
  ['autentiseringe', 'authenticator'],
  ['bankid', 'bankid'],
  ['epost', 'email'],
  ['eposten', 'email'],
  ['feil', 'error'],
  ['fel', 'error'],
  ['fungerar', 'working'],
  ['fungerer', 'working'],
  ['hjalp', 'help'],
  ['innlogging', 'login'],
  ['innloggning', 'login'],
  ['inlogging', 'login'],
  ['inloggning', 'login'],
  ['kod', 'code'],
  ['kode', 'code'],
  ['losenord', 'password'],
  ['losenords', 'password'],
  ['mejl', 'email'],
  ['passord', 'password'],
  ['passordet', 'password'],
  ['setuphjalp', 'setup'],
  ['virker', 'working']
]);

const IGNORED_SUMMARIES = new Set([
  'new advisor at external distributor partner',
  'remove access',
  'ict service hierarchy',
  'auto pre approved'
]);

function normalizeCharacters(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[åÅ]/g, 'a')
    .replace(/[\u0300-\u036f]/g, '');
}

function canonicalizeToken(token: string): string {
  const compact = token.replace(/[_-]/g, '');

  if (/^(innlogg|inlogg|inloggn|logg|logge|logga|login)/.test(compact)) {
    return 'login';
  }

  if (/^(autentiser|autentis|autentik)/.test(compact)) {
    return 'authenticator';
  }

  if (/^(losenord|passord|password)/.test(compact)) {
    return 'password';
  }

  if (/^(funger|virk|work)/.test(compact)) {
    return 'working';
  }

  if (/^(epost|mejl|mail|email)/.test(compact)) {
    return 'email';
  }

  if (/^(oppsett|installasjon|installning|konfigurasjon|setup)/.test(compact)) {
    return 'setup';
  }

  if (/^(feil|fel|error)/.test(compact)) {
    return 'error';
  }

  if (/^(kode|kod|code)/.test(compact)) {
    return 'code';
  }

  return TOKEN_ALIASES.get(compact) ?? TOKEN_ALIASES.get(token) ?? token;
}

export function normalizeSummary(summary: string): string {
  return normalizeCharacters(summary)
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^\p{L}\p{N}\s_]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isIgnoredSummary(summary: string): boolean {
  return IGNORED_SUMMARIES.has(normalizeSummary(summary));
}

export function tokenizeSummary(summary: string): string[] {
  return normalizeSummary(summary)
    .split(' ')
    .map((token) => token.trim())
    .map((token) => canonicalizeToken(token))
    .map((token) => token
      .replace(/^test(?:[\d_-].*)$/i, 'test')
      .replace(/^\d+/, '')
      .replace(/\d+$/, '')
      .replace(/(ing|ed)$/i, ''))
    .map((token) => canonicalizeToken(token))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token) && token !== 'test');
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

export function isOnOrAfterIso(valueIso: string, thresholdIso: string): boolean {
  const valueTime = new Date(valueIso).getTime();
  const thresholdTime = new Date(thresholdIso).getTime();

  if (!Number.isFinite(valueTime) || !Number.isFinite(thresholdTime)) {
    return false;
  }

  return valueTime >= thresholdTime;
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

export function commonTopicScore(a: string[], b: string[]): number {
  const sharedTokens = [...new Set(a)].filter((token) => b.includes(token));
  if (!sharedTokens.length) return 0;

  const longestTokenLength = sharedTokens.reduce((longest, token) => Math.max(longest, token.length), 0);
  const firstTokenMatch = a[0] && b[0] && a[0] === b[0];

  let score = 0;
  if (longestTokenLength >= 5) {
    score += 0.2;
  }

  if (sharedTokens.length >= 3) {
    score += 0.2;
  }

  if (firstTokenMatch && longestTokenLength >= 5) {
    score += 0.15;
  }

  return Math.min(score, 0.5);
}
