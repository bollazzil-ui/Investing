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
import { fetchFxRates, fetchQuote, type FxResult, type QuoteResult } from './quotes';
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
        source: 'ECB reference rates',
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
  for (const symbol of candidates) {
    if (signal?.aborted) break;
    try {
      const quote = await fetchPrice(symbol, signal);
      if (quote.price > 0) {
        return {
          item: {
            label: name,
            status: quote.price === position.unitPrice ? 'unchanged' : 'updated',
            from: position.unitPrice,
            to: quote.price,
            source: symbol,
          },
          price: quote.price,
          symbol,
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
        ? `"${explicit}" — ${lastReason}`
        : `None of ${candidates.join(', ')} returned a price. ${lastReason} Set a quote symbol on the position, or enter the price by hand.`,
    },
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
): Promise<{ portfolio: Portfolio; report: RefreshReport }> {
  const fetchFxImpl = deps.fetchFx ?? fetchFxRates;
  const fetchPriceImpl = deps.fetchPrice ?? fetchQuote;
  const { signal } = deps;

  const [fx, priceResults] = await Promise.all([
    refreshFx(portfolio, fetchFxImpl, signal),
    Promise.all(portfolio.positions.map((p) => refreshPrice(p, fetchPriceImpl, signal))),
  ]);

  const next: Portfolio = {
    ...portfolio,
    settings: {
      ...portfolio.settings,
      fxRates: { ...portfolio.settings.fxRates, ...fx.rates },
    },
    positions: portfolio.positions.map((p, i) => {
      const r = priceResults[i];
      if (r.price === undefined) return p;
      return {
        ...p,
        unitPrice: r.price,
        // Remember a symbol that worked, so next time is one request.
        quoteSymbol: p.quoteSymbol?.trim() || r.symbol,
      };
    }),
  };

  const prices = priceResults.map((r) => r.item);
  const all = [...fx.items, ...prices];
  const count = (s: RefreshStatus) => all.filter((i) => i.status === s).length;
  const failed = count('failed');
  const skipped = count('skipped');

  return {
    portfolio: next,
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
