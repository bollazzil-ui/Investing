/**
 * Optional live data. Everything here is best-effort: the app is fully usable
 * with manual entry, and every failure is surfaced rather than swallowed.
 */

export interface FxResult {
  rates: Record<string, number>;
  asOf: string;
  /** Currencies that were asked for but which the service did not return. */
  missing: string[];
}

/**
 * Fetches exchange rates from Frankfurter (ECB reference rates, no API key,
 * CORS-enabled so it works straight from the browser).
 *
 * Returns units of `base` per 1 unit of each symbol — the direction this app
 * stores rates in. Frankfurter quotes the other way round, so the values are
 * inverted.
 *
 * A currency the service does not cover is reported in `missing` rather than
 * throwing, so one unknown currency cannot discard the rates that did arrive.
 * Only a failure of the whole request throws.
 */
export async function fetchFxRates(
  base: string,
  symbols: string[],
  signal?: AbortSignal,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (i, init) =>
    fetch(i, init),
): Promise<FxResult> {
  const wanted = symbols.map((s) => s.toUpperCase()).filter((s) => s && s !== base.toUpperCase());
  if (wanted.length === 0) {
    return { rates: {}, asOf: new Date().toISOString().slice(0, 10), missing: [] };
  }

  const url = `https://api.frankfurter.app/latest?base=${encodeURIComponent(
    base.toUpperCase(),
  )}&symbols=${encodeURIComponent(wanted.join(','))}`;

  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`Exchange-rate service returned ${res.status}.`);
  const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
  if (!data.rates) throw new Error('Exchange-rate service returned no rates.');

  const rates: Record<string, number> = {};
  for (const [code, perBase] of Object.entries(data.rates)) {
    // perBase = how many `code` you get for 1 base; we store base per 1 code.
    // Inverting produces a long float tail (0.867980210051…), and these land in
    // a visible input, so they are rounded to the six decimals FX is quoted to.
    if (Number.isFinite(perBase) && perBase > 0) {
      rates[code] = Math.round((1 / perBase) * 1e6) / 1e6;
    }
  }
  return {
    rates,
    asOf: data.date ?? new Date().toISOString().slice(0, 10),
    missing: wanted.filter((c) => !(c in rates)),
  };
}

export interface QuoteResult {
  symbol: string;
  price: number;
  currency?: string;
  asOf?: string;
}

/**
 * Fetches a last price from Stooq.
 *
 * Stooq sends no CORS headers, so the browser cannot call it directly. The Vite
 * dev server proxies `/api/stooq` for local use; deploying this needs an
 * equivalent proxy (see README). Without one, this rejects and the UI falls
 * back to manual entry.
 */
export async function fetchQuote(
  symbol: string,
  signal?: AbortSignal,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (i, init) =>
    fetch(i, init),
): Promise<QuoteResult> {
  const s = symbol.trim().toLowerCase();
  if (!s) throw new Error('No quote symbol set.');
  const url = `/api/stooq/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcv&h&e=csv`;

  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`Quote service returned ${res.status}.`);
  const text = await res.text();

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`No data for "${symbol}".`);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const cells = lines[1].split(',').map((c) => c.trim());
  const get = (key: string) => {
    const i = header.indexOf(key);
    return i === -1 ? undefined : cells[i];
  };

  const close = Number(get('close'));
  if (!Number.isFinite(close) || close <= 0) {
    throw new Error(`"${symbol}" is not a known symbol, or the market has no price for it.`);
  }
  return { symbol: s, price: close, asOf: get('date') };
}

/** True when live quotes can plausibly work (dev server or a configured proxy). */
export const QUOTES_NEED_PROXY = true;
