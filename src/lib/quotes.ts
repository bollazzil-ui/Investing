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
 * Where the Stooq CSV endpoint is reachable from the browser.
 *
 * Stooq sends no CORS headers, so a page can never call it directly — the
 * request has to go through something same-origin. The default path is proxied
 * by the Vite dev server and by `netlify.toml` on a deployed build; setting
 * `VITE_STOOQ_PROXY` points it at a different proxy (an absolute URL works, as
 * long as *that* host sends CORS headers).
 */
export const STOOQ_BASE = (
  (import.meta.env?.VITE_STOOQ_PROXY as string | undefined)?.trim() || '/api/stooq'
).replace(/\/+$/, '');

/**
 * Thrown when the quote request came back with something other than Stooq's
 * CSV — almost always a static host answering the un-proxied `/api/stooq/...`
 * with `index.html` and a 200, which would otherwise read as "unknown symbol"
 * and send the user hunting for a typo that isn't there.
 */
export class QuoteProxyError extends Error {
  constructor() {
    super(
      `The quote proxy at ${STOOQ_BASE} returned a page instead of price data, so it is not ` +
        'forwarding to Stooq. Run the dev server, or configure the proxy on your deployment ' +
        '(see README > Live quotes).',
    );
    this.name = 'QuoteProxyError';
  }
}

/**
 * Whether the header row is Stooq's, rather than some other CSV the proxy
 * happened to return. An unknown *symbol* still has this header — Stooq fills
 * the data columns with "N/D" — so this separates "wrong service" from
 * "wrong ticker".
 */
function looksLikeStooqCsv(header: string[]): boolean {
  return header.includes('close') && header.includes('symbol');
}

/**
 * Fetches a last price from Stooq, via the proxy described on `STOOQ_BASE`.
 *
 * Rejects rather than guessing: a missing proxy, an unknown symbol and a
 * market with no price for the symbol are three different messages, because
 * the fix for each is different.
 */
export async function fetchQuote(
  symbol: string,
  signal?: AbortSignal,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (i, init) =>
    fetch(i, init),
): Promise<QuoteResult> {
  const s = symbol.trim().toLowerCase();
  if (!s) throw new Error('No quote symbol set.');
  const url = `${STOOQ_BASE}/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcv&h&e=csv`;

  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`Quote service returned ${res.status}.`);
  const text = await res.text();

  // A SPA host serves index.html for an unmatched path — with a 200, so `ok`
  // above proves nothing about what actually answered.
  if (/^\s*<(?:!doctype|html|\?xml)/i.test(text)) throw new QuoteProxyError();

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`No data for "${symbol}".`);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  if (!looksLikeStooqCsv(header)) throw new QuoteProxyError();

  const cells = lines[1].split(',').map((c) => c.trim());
  const get = (key: string) => {
    const i = header.indexOf(key);
    return i === -1 ? undefined : cells[i];
  };

  const close = Number(get('close'));
  if (!Number.isFinite(close) || close <= 0) {
    throw new Error(`"${symbol}" is not a known symbol, or the market has no price for it.`);
  }
  const asOf = get('date');
  return { symbol: s, price: close, asOf: asOf && asOf !== 'N/D' ? asOf : undefined };
}
