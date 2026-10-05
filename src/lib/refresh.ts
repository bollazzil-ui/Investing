/**
 * "Refresh prices": one action that re-fetches every exchange rate and every
 * share price the portfolio depends on.
 *
 * The point of this module is the *report*. Live data fails in many ordinary
 * ways — no symbol set, a symbol the provider does not know, a proxy that is
 * not configured, a rate-limited service — and the user needs to be told which
 * specific currency or product did not update, and why, so they can type the
 * value in themselves. Nothing here ever invents or silently keeps a stale
 * number without saying so.
 */
import type { Portfolio, Position } from '../types';
import {
  currencyMismatch,
  fetchFxRates,
  fetchQuote,
  type FxResult,
  type QuoteResult,
} from './quotes';
import { quoteCandidates } from './lookup';

export type RefreshStatus = 'updated' | 'unchanged' | 'failed' | 'skipped';

export interface RefreshItem {
  /** What was being refreshed, e.g. "USD" or "SWDA". */
  label: string;
  status: RefreshStatus;
  /** For a success: the old and new value, and where it came from. */
  from?: number;
  to?: number;
  source?: string;
  /** For a failure or skip: why, in words the user can act on. */
  reason?: string;
}

export interface RefreshReport {
  fx: RefreshItem[];
  prices: RefreshItem[];
  /** The FX service's own value date, when it answered. */
  asOf?: string;
  updated: number;
  failed: number;
  skipped: number;
  /** True when nothing needs the user's attention. */
  clean: boolean;
}

export interface RefreshDeps {
  fetchFx?: (base: string, symbols: string[], signal?: AbortSignal) => Promise<FxResult>;
  fetchPrice?: (symbol: string, signal?: AbortSignal) => Promise<QuoteResult>;
  signal?: AbortSignal;
}

/** How long a single refresh may take before it is abandoned. */
export const REFRESH_TIMEOUT_MS = 20_000;

function reason(e: unknown): string {
  if (e instanceof Error && e.name === 'AbortError') {
    return 'The request took too long and was cancelled.';
  }
  if (e instanceof TypeError) {
    // A browser reports a blocked cross-origin call as a bare network failure.
    return 'The service could not be reached — check your connection, or the proxy if this is a deployed build.';
  }
  return e instanceof Error ? e.message : 'The request failed.';
}

/** Currencies the portfolio actually needs a rate for. */
export function neededCurrencies(portfolio: Portfolio): string[] {
  const base = portfolio.settings.baseCurrency.toUpperCase();
  return [
    ...new Set(
      portfolio.positions
        .map((p) => p.currency.toUpperCase())
        .filter((c) => c && c !== base),
    ),
  ].sort();
}

async function refreshFx(
  portfolio: Portfolio,
  fetchFx: NonNullable<RefreshDeps['fetchFx']>,
  signal: AbortSignal | undefined,
): Promise<{ rates: Record<string, number>; items: RefreshItem[]; asOf?: string }> {
  const codes = neededCurrencies(portfolio);
  if (codes.length === 0) return { rates: {}, items: [] };

  const base = portfolio.settings.baseCurrency.toUpperCase();
  try {
    const result = await fetchFx(portfolio.settings.baseCurrency, codes, signal);
    const items: RefreshItem[] = codes.map((code) => {
      const next = result.rates[code];
      if (!(next > 0)) {
        return {
          label: `${code} → ${base}`,
          status: 'failed',
          reason: `The exchange-rate service does not cover ${code}.`,
        };
      }
      const previous = portfolio.settings.fxRates[code];
      return {
        label: `${code} → ${base}`,
        status: previous === next ? 'unchanged' : 'updated',
        from: previous,
        to: next,
        source: result.source,
      };
    });
    return { rates: result.rates, items, asOf: result.asOf };
  } catch (e) {
    // The whole request failed, so every currency is unresolved.
    const why = reason(e);
    return {
      rates: {},
      items: codes.map((code) => ({
        label: `${code} → ${base}`,
        status: 'failed',
        reason: why,
      })),
    };
  }
}

async function refreshPrice(
  position: Position,
  fetchPrice: NonNullable<RefreshDeps['fetchPrice']>,
  signal: AbortSignal | undefined,
): Promise<{ item: RefreshItem; price?: number; symbol?: string }> {
  const name = position.ticker || position.name || 'Unnamed position';

  // An explicit symbol is used on its own, so its failure can be reported
  // precisely. Without one, the usual venue suffixes are tried in turn.
  const explicit = position.quoteSymbol?.trim();
  const candidates = explicit ? [explicit] : quoteCandidates(position.ticker);

  if (candidates.length === 0) {
    return {
      item: {
        label: name,
        status: 'skipped',
        reason: 'No quote symbol and no ticker to derive one from — enter the price by hand.',
      },
    };
  }

  let lastReason = '';
  // A listing found in the wrong currency is the most useful thing to report,
  // so it is not overwritten by a later candidate that simply does not exist.
  let mismatchReason = '';
  for (const symbol of candidates) {
    if (signal?.aborted) break;
    try {
      const quote = await fetchPrice(symbol, signal);
      const mismatch = currencyMismatch(quote, position.currency);
      if (mismatch) {
        // The listing exists but in another currency; another candidate may
        // be the right listing, so keep looking.
        mismatchReason ||= mismatch;
        continue;
      }
      if (quote.price > 0) {
        return {
          item: {
            label: name,
            status: quote.price === position.unitPrice ? 'unchanged' : 'updated',
            from: position.unitPrice,
            to: quote.price,
            source: quote.symbol || symbol,
          },
          price: quote.price,
          symbol: quote.symbol || symbol,
        };
      }
      lastReason = `"${symbol}" returned no price.`;
    } catch (e) {
      lastReason = reason(e);
    }
  }

  return {
    item: {
      label: name,
      status: 'failed',
      reason: explicit
        ? mismatchReason || `"${explicit}" — ${lastReason}`
        : `None of ${candidates.join(', ')} returned a usable price. ${mismatchReason || lastReason} Set a quote symbol on the position, or enter the price by hand.`,
    },
  };
}

/** The values a refresh fetched: FX rates, and prices keyed by position id. */
export interface RefreshUpdates {
  fxRates: Record<string, number>;
  prices: Record<string, { unitPrice: number; quoteSymbol?: string }>;
}

/**
 * Writes fetched values onto a portfolio. Only the fetched fields change, so
 * applying it to the *current* portfolio keeps any edit the user made while
 * the refresh was in flight; a position deleted meanwhile is simply skipped.
 */
export function applyRefresh(portfolio: Portfolio, updates: RefreshUpdates): Portfolio {
  return {
    ...portfolio,
    settings: {
      ...portfolio.settings,
      fxRates: { ...portfolio.settings.fxRates, ...updates.fxRates },
    },
    positions: portfolio.positions.map((p) => {
      const u = updates.prices[p.id];
      return u ? { ...p, ...u } : p;
    }),
  };
}

/**
 * Refreshes every rate and price, and returns both the updated portfolio and a
 * per-item report. The portfolio is never mutated, and a value that could not
 * be fetched is left exactly as it was so a manual entry is never overwritten
 * by a failure.
 */
export async function refreshAll(
  portfolio: Portfolio,
  deps: RefreshDeps = {},
): Promise<{ portfolio: Portfolio; updates: RefreshUpdates; report: RefreshReport }> {
  const fetchFxImpl = deps.fetchFx ?? fetchFxRates;
  const fetchPriceImpl = deps.fetchPrice ?? fetchQuote;
  const { signal } = deps;

  const [fx, priceResults] = await Promise.all([
    refreshFx(portfolio, fetchFxImpl, signal),
    Promise.all(portfolio.positions.map((p) => refreshPrice(p, fetchPriceImpl, signal))),
  ]);

  const updates: RefreshUpdates = { fxRates: fx.rates, prices: {} };
  portfolio.positions.forEach((p, i) => {
    const r = priceResults[i];
    // Remember the symbol that worked, in the provider's own form, so next
    // time is one request.
    if (r.price !== undefined) updates.prices[p.id] = { unitPrice: r.price, quoteSymbol: r.symbol };
  });
  const next = applyRefresh(portfolio, updates);

  const prices = priceResults.map((r) => r.item);
  const all = [...fx.items, ...prices];
  const count = (s: RefreshStatus) => all.filter((i) => i.status === s).length;
  const failed = count('failed');
  const skipped = count('skipped');

  return {
    portfolio: next,
    updates,
    report: {
      fx: fx.items,
      prices,
      asOf: fx.asOf,
      updated: count('updated'),
      failed,
      skipped,
      clean: failed === 0 && skipped === 0,
    },
  };
}
