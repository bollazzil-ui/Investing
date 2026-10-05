/**
 * Instrument lookup: turn an ISIN or ticker into a filled-in product.
 *
 * Two providers, both free and key-less:
 *   - OpenFIGI (api.openfigi.com/v3/mapping) maps an ISIN or ticker to a
 *     symbol, a name and a listing exchange.
 *   - Yahoo Finance supplies the last price and the currency it is quoted in.
 *
 * OpenFIGI returns no trading currency. When Yahoo prices the listing, its
 * currency is used; otherwise one is derived from the listing exchange and
 * reported as a guess — a London listing can be quoted in USD, GBP or EUR.
 *
 * Everything here is best-effort. Any failure leaves the form usable by hand;
 * nothing is silently invented.
 */
import { isValidIsin, looksLikeIsin, normalizeIsin } from './isin';
import { fetchQuote, toYahooSymbol } from './quotes';

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
 * `yahooSuffix` is the exchange suffix on a Yahoo Finance symbol ('' for US
 * listings, which carry none), and `currency` is null where the exchange lists
 * in more than one currency.
 */
interface ExchangeInfo {
  label: string;
  yahooSuffix: string;
  currency: string | null;
}

export const EXCHANGES: Record<string, ExchangeInfo> = {
  LN: { label: 'London Stock Exchange', yahooSuffix: '.L', currency: null },
  GY: { label: 'Xetra', yahooSuffix: '.DE', currency: 'EUR' },
  GR: { label: 'Xetra', yahooSuffix: '.DE', currency: 'EUR' },
  GF: { label: 'Frankfurt', yahooSuffix: '.F', currency: 'EUR' },
  GD: { label: 'Düsseldorf', yahooSuffix: '.DU', currency: 'EUR' },
  GM: { label: 'Munich', yahooSuffix: '.MU', currency: 'EUR' },
  SW: { label: 'SIX Swiss Exchange', yahooSuffix: '.SW', currency: 'CHF' },
  SE: { label: 'SIX Swiss Exchange', yahooSuffix: '.SW', currency: 'CHF' },
  VX: { label: 'SIX Swiss Exchange', yahooSuffix: '.SW', currency: 'CHF' },
  US: { label: 'United States', yahooSuffix: '', currency: 'USD' },
  UN: { label: 'NYSE', yahooSuffix: '', currency: 'USD' },
  UQ: { label: 'Nasdaq', yahooSuffix: '', currency: 'USD' },
  UW: { label: 'Nasdaq', yahooSuffix: '', currency: 'USD' },
  UA: { label: 'NYSE American', yahooSuffix: '', currency: 'USD' },
  UR: { label: 'NYSE Arca', yahooSuffix: '', currency: 'USD' },
  NA: { label: 'Euronext Amsterdam', yahooSuffix: '.AS', currency: 'EUR' },
  FP: { label: 'Euronext Paris', yahooSuffix: '.PA', currency: 'EUR' },
  IM: { label: 'Borsa Italiana', yahooSuffix: '.MI', currency: 'EUR' },
  SM: { label: 'Bolsa de Madrid', yahooSuffix: '.MC', currency: 'EUR' },
  CN: { label: 'Toronto', yahooSuffix: '.TO', currency: 'CAD' },
  JT: { label: 'Tokyo', yahooSuffix: '.T', currency: 'JPY' },
  HK: { label: 'Hong Kong', yahooSuffix: '.HK', currency: 'HKD' },
  AT: { label: 'Australia', yahooSuffix: '.AX', currency: 'AUD' },
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
    if (info?.currency) s += 2; // we can name a currency
    if (info) s += 1; // at least a known venue
    return s;
  };

  return [...withTicker].sort((a, b) => score(b) - score(a))[0];
}

/** Symbols worth trying against Yahoo Finance, most likely first. */
export function quoteCandidates(ticker: string, exchCode?: string): string[] {
  const base = toYahooSymbol(ticker);
  if (!base) return [];
  const out: string[] = [];
  const known = exchCode ? EXCHANGES[exchCode] : undefined;
  if (known) out.push(base + known.yahooSuffix);
  // A symbol the user typed may already carry its own suffix.
  if (/\.[A-Z]{1,3}$/.test(base)) {
    if (!out.includes(base)) out.push(base);
    return out;
  }
  // Otherwise try the venues European ETFs most often list on, then the US.
  for (const s of ['.L', '.DE', '.SW', '']) {
    const candidate = base + s;
    if (!out.includes(candidate)) out.push(candidate);
  }
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
    quoteImpl?: (
      symbol: string,
      signal?: AbortSignal,
    ) => Promise<{ price: number; symbol?: string; currency?: string }>;
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
    result.ticker = query.toUpperCase().replace(/\.[A-Z]{1,3}$/, '');
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

  // 2. Price and currency, from whichever candidate symbol Yahoo recognises.
  const candidates = quoteCandidates(result.ticker ?? query, match?.exchCode);
  let priced = false;
  for (const symbol of candidates) {
    if (options.signal?.aborted) break;
    try {
      const quote = await quoteImpl(symbol, options.signal);
      if (quote.price > 0) {
        result.unitPrice = quote.price;
        result.quoteSymbol = quote.symbol ?? symbol;
        result.sources.unitPrice = 'lookup';
        if (quote.currency) {
          // The price is in this currency, so it is a fact, not a guess.
          result.currency = quote.currency;
          result.sources.currency = 'lookup';
          result.notes = result.notes.filter((n) => !n.includes('more than one currency'));
        }
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
