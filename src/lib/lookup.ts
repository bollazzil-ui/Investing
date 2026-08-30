/**
 * Instrument lookup: turn an ISIN or ticker into a filled-in product.
 *
 * Two providers, both free and key-less:
 *   - OpenFIGI (api.openfigi.com/v3/mapping) maps an ISIN or ticker to a
 *     symbol, a name and a listing exchange.
 *   - Stooq supplies the last price for a symbol.
 *
 * Neither returns a trading currency, so that is derived from the listing
 * exchange and always reported as a guess for the user to confirm — a London
 * listing in particular can be quoted in USD, GBP or EUR.
 *
 * Everything here is best-effort. Any failure leaves the form usable by hand;
 * nothing is silently invented.
 */
import { isValidIsin, looksLikeIsin, normalizeIsin } from './isin';
import { fetchQuote } from './quotes';

/** Where a filled-in field came from, so the form can flag what to check. */
export type FieldSource = 'lookup' | 'guess' | 'none';

export interface InstrumentLookup {
  query: string;
  isin?: string;
  ticker?: string;
  name?: string;
  currency?: string;
  unitPrice?: number;
  quoteSymbol?: string;
  exchange?: string;
  sources: {
    ticker: FieldSource;
    name: FieldSource;
    currency: FieldSource;
    unitPrice: FieldSource;
  };
  /** Human-readable notes about what could not be resolved. */
  notes: string[];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Listing exchange → what we can infer from it.
 *
 * `stooqSuffix` is null where Stooq has no coverage we can rely on, and
 * `currency` is null where the exchange lists in more than one currency.
 */
interface ExchangeInfo {
  label: string;
  stooqSuffix: string | null;
  currency: string | null;
}

export const EXCHANGES: Record<string, ExchangeInfo> = {
  LN: { label: 'London Stock Exchange', stooqSuffix: '.uk', currency: null },
  GY: { label: 'Xetra', stooqSuffix: '.de', currency: 'EUR' },
  GR: { label: 'Xetra', stooqSuffix: '.de', currency: 'EUR' },
  GF: { label: 'Frankfurt', stooqSuffix: '.de', currency: 'EUR' },
  GD: { label: 'Düsseldorf', stooqSuffix: '.de', currency: 'EUR' },
  GM: { label: 'Munich', stooqSuffix: '.de', currency: 'EUR' },
  SW: { label: 'SIX Swiss Exchange', stooqSuffix: null, currency: 'CHF' },
  SE: { label: 'SIX Swiss Exchange', stooqSuffix: null, currency: 'CHF' },
  VX: { label: 'SIX Swiss Exchange', stooqSuffix: null, currency: 'CHF' },
  US: { label: 'United States', stooqSuffix: '.us', currency: 'USD' },
  UN: { label: 'NYSE', stooqSuffix: '.us', currency: 'USD' },
  UQ: { label: 'Nasdaq', stooqSuffix: '.us', currency: 'USD' },
  UW: { label: 'Nasdaq', stooqSuffix: '.us', currency: 'USD' },
  UA: { label: 'NYSE American', stooqSuffix: '.us', currency: 'USD' },
  UR: { label: 'NYSE Arca', stooqSuffix: '.us', currency: 'USD' },
  NA: { label: 'Euronext Amsterdam', stooqSuffix: null, currency: 'EUR' },
  FP: { label: 'Euronext Paris', stooqSuffix: null, currency: 'EUR' },
  IM: { label: 'Borsa Italiana', stooqSuffix: null, currency: 'EUR' },
  SM: { label: 'Bolsa de Madrid', stooqSuffix: null, currency: 'EUR' },
  CN: { label: 'Toronto', stooqSuffix: null, currency: 'CAD' },
  JT: { label: 'Tokyo', stooqSuffix: '.jp', currency: 'JPY' },
  HK: { label: 'Hong Kong', stooqSuffix: '.hk', currency: 'HKD' },
  AT: { label: 'Australia', stooqSuffix: null, currency: 'AUD' },
};

/** One instrument as OpenFIGI describes it. */
export interface FigiMatch {
  ticker?: string;
  name?: string;
  exchCode?: string;
  securityType?: string;
  marketSector?: string;
}

/**
 * Reads OpenFIGI's `/v3/mapping` response.
 *
 * The endpoint answers with one entry per request item, each carrying either
 * `data` (an array of listings) or `warning` (no match). Anything unexpected
 * yields an empty list rather than throwing, so a provider change degrades to
 * manual entry.
 */
export function parseFigiResponse(payload: unknown): FigiMatch[] {
  if (!Array.isArray(payload) || payload.length === 0) return [];
  const first = payload[0] as { data?: unknown };
  if (!first || !Array.isArray(first.data)) return [];
  return first.data
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      ticker: str(row.ticker),
      name: str(row.name),
      exchCode: str(row.exchCode),
      securityType: str(row.securityType),
      marketSector: str(row.marketSector),
    }));
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/**
 * Picks the listing to present.
 *
 * An ISIN maps to every venue the instrument trades on. Prefer one we can
 * actually price and infer a currency for; fall back to the first listing with
 * a ticker so the name is still filled in.
 */
export function pickBestMatch(matches: FigiMatch[], preferred?: string[]): FigiMatch | undefined {
  const withTicker = matches.filter((m) => m.ticker);
  if (withTicker.length === 0) return undefined;

  const score = (m: FigiMatch): number => {
    const info = m.exchCode ? EXCHANGES[m.exchCode] : undefined;
    let s = 0;
    if (preferred && m.exchCode && preferred.includes(m.exchCode)) s += 8;
    if (info?.stooqSuffix) s += 4; // we can fetch a price
    if (info?.currency) s += 2; // we can name a currency
    if (info) s += 1; // at least a known venue
    return s;
  };

  return [...withTicker].sort((a, b) => score(b) - score(a))[0];
}

/** Symbols worth trying against Stooq, most likely first. */
export function quoteCandidates(ticker: string, exchCode?: string): string[] {
  const base = ticker.trim().toLowerCase().replace(/\s+/g, '');
  if (!base) return [];
  const out: string[] = [];
  const suffix = exchCode ? EXCHANGES[exchCode]?.stooqSuffix : undefined;
  if (suffix) out.push(base + suffix);
  // A symbol the user typed may already carry its own suffix.
  if (/\.[a-z]{2,3}$/.test(base)) out.push(base);
  for (const s of ['.uk', '.de', '.us']) {
    const candidate = base + s;
    if (!out.includes(candidate)) out.push(candidate);
  }
  if (!out.includes(base)) out.push(base);
  return out;
}

export const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';
/** Same endpoint via the app's own origin, for when the browser blocks the direct call. */
export const OPENFIGI_PROXY_URL = '/api/openfigi/v3/mapping';

async function postFigi(
  url: string,
  body: Record<string, string>[],
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<FigiMatch[]> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 429) {
    throw new Error('The instrument directory is rate-limited right now. Try again in a minute.');
  }
  if (!res.ok) throw new Error(`The instrument directory returned ${res.status}.`);
  return parseFigiResponse(await res.json());
}

/**
 * Calls OpenFIGI directly, falling back to the same-origin proxy path if the
 * browser refuses the cross-origin request. Only a network/CORS failure is
 * retried — a real HTTP error would fail identically through the proxy.
 */
async function mapWithFigi(
  body: Record<string, string>[],
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<FigiMatch[]> {
  try {
    return await postFigi(OPENFIGI_URL, body, fetchImpl, signal);
  } catch (e) {
    if (!isNetworkError(e) || signal?.aborted) throw e;
    return await postFigi(OPENFIGI_PROXY_URL, body, fetchImpl, signal);
  }
}

/**
 * Resolves an ISIN or ticker into as much of a product as can be established.
 *
 * Never throws for a merely incomplete answer — an unresolvable field comes
 * back absent, with a note saying so.
 */
export async function lookupInstrument(
  rawQuery: string,
  options: {
    fetchImpl?: FetchLike;
    quoteImpl?: (symbol: string, signal?: AbortSignal) => Promise<{ price: number }>;
    signal?: AbortSignal;
    /** Exchange codes to favour, e.g. the venues the user actually trades on. */
    preferredExchanges?: string[];
  } = {},
): Promise<InstrumentLookup> {
  const fetchImpl = options.fetchImpl ?? ((i, init) => fetch(i, init));
  const quoteImpl = options.quoteImpl ?? fetchQuote;
  const query = rawQuery.trim();

  const result: InstrumentLookup = {
    query,
    sources: { ticker: 'none', name: 'none', currency: 'none', unitPrice: 'none' },
    notes: [],
  };
  if (!query) return result;

  const isIsinShaped = looksLikeIsin(query);
  if (isIsinShaped) {
    const isin = normalizeIsin(query);
    if (!isValidIsin(isin)) {
      throw new Error(
        `${isin} is not a valid ISIN — its check digit does not match. Please re-check the code.`,
      );
    }
    result.isin = isin;
  }

  // 1. Identity: ticker, name and listing exchange.
  let match: FigiMatch | undefined;
  try {
    const matches = isIsinShaped
      ? await mapWithFigi([{ idType: 'ID_ISIN', idValue: result.isin! }], fetchImpl, options.signal)
      : await mapWithFigi(
          [{ idType: 'TICKER', idValue: query.toUpperCase() }],
          fetchImpl,
          options.signal,
        );
    match = pickBestMatch(matches, options.preferredExchanges);
    if (!match) {
      result.notes.push(
        isIsinShaped
          ? 'The instrument directory has no listing for this ISIN. Fill the details in by hand.'
          : 'The instrument directory has no listing for this symbol. Fill the details in by hand.',
      );
    }
  } catch (e) {
    result.notes.push(
      isNetworkError(e)
        ? 'Could not reach the instrument directory, so the name could not be filled in.'
        : message(e),
    );
  }

  if (match?.ticker) {
    result.ticker = match.ticker;
    result.sources.ticker = 'lookup';
  } else if (!isIsinShaped) {
    // Nothing was resolved; this is simply the symbol the user typed, so it is
    // carried forward as a convenience and never badged as a lookup result.
    result.ticker = query.toUpperCase().replace(/\.[A-Z]{2,3}$/, '');
    result.sources.ticker = 'none';
  }
  if (match?.name) {
    result.name = titleCase(match.name);
    result.sources.name = 'lookup';
  }
  if (match?.exchCode) {
    result.exchange = EXCHANGES[match.exchCode]?.label ?? match.exchCode;
    const currency = EXCHANGES[match.exchCode]?.currency;
    if (currency) {
      result.currency = currency;
      result.sources.currency = 'guess';
    } else if (EXCHANGES[match.exchCode]) {
      result.notes.push(
        `${EXCHANGES[match.exchCode].label} lists in more than one currency — please set it yourself.`,
      );
    }
  }

  // 2. Price, from whichever candidate symbol Stooq recognises.
  const candidates = quoteCandidates(result.ticker ?? query, match?.exchCode);
  let priced = false;
  for (const symbol of candidates) {
    if (options.signal?.aborted) break;
    try {
      const quote = await quoteImpl(symbol, options.signal);
      if (quote.price > 0) {
        result.unitPrice = quote.price;
        result.quoteSymbol = symbol;
        result.sources.unitPrice = 'lookup';
        priced = true;
        break;
      }
    } catch (e) {
      if (isAbort(e)) break;
      // Try the next candidate; only the last failure is worth reporting.
    }
  }
  if (!priced) {
    result.notes.push(
      'No live price was available for this symbol, so please enter the price per share yourself.',
    );
  }

  return result;
}

/** "ISHARES CORE MSCI WORLD" reads better as "iShares Core MSCI World". */
export function titleCase(name: string): string {
  if (!/[a-z]/.test(name)) {
    return name
      .toLowerCase()
      .split(/\s+/)
      .map((word) => {
        if (/^(msci|etf|ucits|plc|ag|nv|sa|usd|eur|chf|gbp|em|imi|reit|s&p)$/i.test(word)) {
          return word.toUpperCase();
        }
        if (/^i(shares|nvesco)$/i.test(word)) return `i${word.slice(1, 2).toUpperCase()}${word.slice(2)}`;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }
  return name;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'The lookup failed.';
}

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}
