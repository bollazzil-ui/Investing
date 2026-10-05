/**
 * Optional live data. Everything here is best-effort: the app is fully usable
 * with manual entry, and every failure is surfaced rather than swallowed.
 */

export interface FxResult {
  rates: Record<string, number>;
  asOf: string;
  /** Currencies that were asked for but which the service did not return. */
  missing: string[];
  /** Where the rates came from, for the refresh report. */
  source: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (i, init) => fetch(i, init);

/** Frankfurter's current address (ECB reference rates, no key, CORS-enabled). */
export const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest';

/**
 * Fetches exchange rates: ECB reference rates from Frankfurter, falling back to
 * Yahoo Finance when Frankfurter cannot be reached or answers with an error.
 *
 * Returns units of `base` per 1 unit of each symbol — the direction this app
 * stores rates in.
 *
 * A currency the service does not cover is reported in `missing` rather than
 * throwing, so one unknown currency cannot discard the rates that did arrive.
 * Only a failure of every source throws.
 */
export async function fetchFxRates(
  base: string,
  symbols: string[],
  signal?: AbortSignal,
  fetchImpl: FetchLike = defaultFetch,
): Promise<FxResult> {
  const b = base.toUpperCase();
  const wanted = symbols.map((s) => s.toUpperCase()).filter((s) => s && s !== b);
  if (wanted.length === 0) {
    return { rates: {}, asOf: today(), missing: [], source: 'ECB reference rates' };
  }

  try {
    return await fetchFrankfurter(b, wanted, signal, fetchImpl);
  } catch (e) {
    if (signal?.aborted) throw e;
    const fallback = await fetchYahooFx(b, wanted, signal, fetchImpl);
    // Yahoo answering nothing at all means the original failure is the story.
    if (Object.keys(fallback.rates).length === 0) throw e;
    return fallback;
  }
}

async function fetchFrankfurter(
  base: string,
  wanted: string[],
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<FxResult> {
  const url = `${FRANKFURTER_URL}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(
    wanted.join(','),
  )}`;

  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`Exchange-rate service returned ${res.status}.`);
  const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
  if (!data.rates) throw new Error('Exchange-rate service returned no rates.');

  const rates: Record<string, number> = {};
  for (const [code, perBase] of Object.entries(data.rates)) {
    // perBase = how many `code` you get for 1 base; we store base per 1 code.
    if (Number.isFinite(perBase) && perBase > 0) rates[code] = round6(1 / perBase);
  }
  return {
    rates,
    asOf: data.date ?? today(),
    missing: wanted.filter((c) => !(c in rates)),
    source: 'ECB reference rates',
  };
}

/** Yahoo quotes `USDCHF=X` as CHF per 1 USD — already the direction we store. */
async function fetchYahooFx(
  base: string,
  wanted: string[],
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<FxResult> {
  const results = await Promise.allSettled(
    wanted.map((code) => fetchYahooChart(`${code}${base}=X`, signal, fetchImpl)),
  );
  const rates: Record<string, number> = {};
  let asOf: string | undefined;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      rates[wanted[i]] = round6(r.value.price);
      asOf ??= r.value.asOf;
    }
  });
  return {
    rates,
    asOf: asOf ?? today(),
    missing: wanted.filter((c) => !(c in rates)),
    source: 'Yahoo Finance',
  };
}

// Inverting produces a long float tail (0.867980210051…), and these land in a
// visible input, so they are rounded to the six decimals FX is quoted to.
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuoteResult {
  symbol: string;
  price: number;
  /** ISO code the price is in, as the provider reports it (pence already converted). */
  currency?: string;
  asOf?: string;
}

/**
 * Old Stooq-style symbols (`swda.uk`, `aapl.us`) mapped to Yahoo's
 * (`SWDA.L`, `AAPL`), so positions saved before the switch keep working.
 */
const STOOQ_TO_YAHOO: Record<string, string> = {
  uk: '.L',
  de: '.DE',
  us: '',
  jp: '.T',
  hk: '.HK',
};

/** Normalises a symbol to Yahoo's form: upper case, Yahoo exchange suffix. */
export function toYahooSymbol(symbol: string): string {
  const s = symbol.trim().replace(/\s+/g, '');
  const m = /^(.+)\.([a-z]{2})$/.exec(s);
  if (m && m[2] in STOOQ_TO_YAHOO) return (m[1] + STOOQ_TO_YAHOO[m[2]]).toUpperCase();
  return s.toUpperCase();
}

/**
 * Some exchanges quote in a minor unit — London in pence ("GBp"). Prices are
 * converted to the major unit so they match the position's currency.
 */
const MINOR_UNITS: Record<string, { currency: string; divisor: number }> = {
  GBp: { currency: 'GBP', divisor: 100 },
  GBX: { currency: 'GBP', divisor: 100 },
  ZAc: { currency: 'ZAR', divisor: 100 },
  ILA: { currency: 'ILS', divisor: 100 },
};

/**
 * Fetches a last price from Yahoo Finance's chart endpoint.
 *
 * Yahoo sends no CORS headers, so the browser cannot call it directly. The
 * Vite dev server proxies `/api/yahoo` for local use; deploying this needs an
 * equivalent proxy (see README). Without one, this rejects and the UI falls
 * back to manual entry.
 */
export async function fetchQuote(
  symbol: string,
  signal?: AbortSignal,
  fetchImpl: FetchLike = defaultFetch,
): Promise<QuoteResult> {
  const s = toYahooSymbol(symbol);
  if (!s) throw new Error('No quote symbol set.');
  return { ...(await fetchYahooChart(s, signal, fetchImpl)), symbol: s };
}

async function fetchYahooChart(
  symbol: string,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<QuoteResult> {
  // `=` stays literal: Yahoo FX symbols look like USDCHF=X.
  const path = encodeURIComponent(symbol).replace(/%3D/g, '=');
  const url = `/api/yahoo/v8/finance/chart/${path}?range=1d&interval=1d`;
  const res = await fetchImpl(url, { signal });
  if (res.status === 429) {
    throw new Error('Yahoo Finance is rate-limiting requests right now. Try again in a minute.');
  }

  let data: YahooChart | undefined;
  try {
    data = (await res.json()) as YahooChart;
  } catch {
    data = undefined;
  }
  const result = data?.chart?.result?.[0];
  if (!res.ok || !result) {
    if (res.status === 404 || data?.chart?.error?.code === 'Not Found') {
      throw new Error(`"${symbol}" is not a symbol Yahoo Finance knows.`);
    }
    throw new Error(`Quote service returned ${res.status}.`);
  }

  const meta = result.meta ?? {};
  let price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`"${symbol}" has no current price on Yahoo Finance.`);
  }
  let currency = meta.currency || undefined;
  const minor = currency ? MINOR_UNITS[currency] : undefined;
  if (minor) {
    price = price / minor.divisor;
    currency = minor.currency;
  }
  return {
    symbol,
    price: Math.round(price * 1e6) / 1e6,
    currency: currency?.toUpperCase(),
    asOf: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : undefined,
  };
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: number; currency?: string; regularMarketTime?: number };
    }[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

/**
 * A price in the wrong currency would silently corrupt every number in the
 * plan, so a mismatch is an error the user has to resolve, never converted.
 */
export function currencyMismatch(quote: QuoteResult, positionCurrency: string): string | null {
  const want = positionCurrency.trim().toUpperCase();
  if (!quote.currency || !want || quote.currency === want) return null;
  return `"${quote.symbol}" is quoted in ${quote.currency}, but the position is in ${want}. Change the position's currency to ${quote.currency}, or use the symbol of a ${want} listing.`;
}
