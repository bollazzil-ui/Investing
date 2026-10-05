import { describe, expect, it } from 'vitest';
import { currencyMismatch, fetchFxRates, fetchQuote, toYahooSymbol } from './quotes';

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('fetchFxRates', () => {
  it('inverts the quote direction and rounds to six decimals', async () => {
    // Frankfurter gives CHF→USD; the app stores USD→CHF.
    const r = await fetchFxRates('CHF', ['USD'], undefined, async () =>
      json({ date: '2026-08-28', rates: { USD: 1.1521 } }),
    );
    expect(r.rates.USD).toBe(0.86798);
    expect(String(r.rates.USD)).not.toMatch(/\d{8,}/);
    expect(r.asOf).toBe('2026-08-28');
    expect(r.missing).toEqual([]);
  });

  it('reports a currency the service does not cover instead of throwing', async () => {
    const r = await fetchFxRates('CHF', ['USD', 'XYZ'], undefined, async () =>
      json({ date: '2026-08-28', rates: { USD: 1.1521 } }),
    );
    expect(r.rates.USD).toBeCloseTo(0.86798, 6);
    expect(r.missing).toEqual(['XYZ']);
  });

  it('skips the request when only the base currency is asked for', async () => {
    let called = false;
    const r = await fetchFxRates('CHF', ['CHF'], undefined, async () => {
      called = true;
      return json({});
    });
    expect(called).toBe(false);
    expect(r.rates).toEqual({});
  });

  it('throws when every source fails', async () => {
    await expect(
      fetchFxRates('CHF', ['USD'], undefined, async () => json({}, 503)),
    ).rejects.toThrow(/503/);
  });

  it('falls back to Yahoo Finance when Frankfurter cannot be reached', async () => {
    const r = await fetchFxRates('CHF', ['USD', 'EUR'], undefined, async (url) => {
      if (url.startsWith('https://api.frankfurter.dev')) throw new TypeError('Failed to fetch');
      if (url.includes('USDCHF=X')) return json(chart({ regularMarketPrice: 0.8505, currency: 'CHF' }));
      return json({ chart: { result: null, error: { code: 'Not Found' } } }, 404);
    });
    // Yahoo's USDCHF=X is already CHF per USD — no inversion.
    expect(r.rates).toEqual({ USD: 0.8505 });
    expect(r.missing).toEqual(['EUR']);
    expect(r.source).toBe('Yahoo Finance');
  });
});

const chart = (meta: Record<string, unknown>) => ({
  chart: { result: [{ meta }], error: null },
});

describe('toYahooSymbol', () => {
  it('converts old Stooq symbols and upper-cases Yahoo ones', () => {
    expect(toYahooSymbol('swda.uk')).toBe('SWDA.L');
    expect(toYahooSymbol('iusn.de')).toBe('IUSN.DE');
    expect(toYahooSymbol('aapl.us')).toBe('AAPL');
    expect(toYahooSymbol(' chspi.sw ')).toBe('CHSPI.SW');
    expect(toYahooSymbol('IUSN.DE')).toBe('IUSN.DE');
  });
});

describe('fetchQuote', () => {
  it('reads price, currency and date from the chart endpoint', async () => {
    let url = '';
    const q = await fetchQuote('eunl.de', undefined, async (u) => {
      url = u;
      return json(chart({ regularMarketPrice: 89.84, currency: 'EUR', regularMarketTime: 1787929200 }));
    });
    expect(url).toBe('/api/yahoo/v8/finance/chart/EUNL.DE?range=1d&interval=1d');
    expect(q).toMatchObject({ symbol: 'EUNL.DE', price: 89.84, currency: 'EUR' });
    expect(q.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('converts London prices quoted in pence to pounds', async () => {
    const q = await fetchQuote('SWDA.L', undefined, async () =>
      json(chart({ regularMarketPrice: 7810.5, currency: 'GBp' })),
    );
    expect(q.price).toBe(78.105);
    expect(q.currency).toBe('GBP');
  });

  it('rejects a symbol the provider does not know', async () => {
    await expect(
      fetchQuote('NOPE.DE', undefined, async () =>
        json({ chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } }, 404),
      ),
    ).rejects.toThrow(/not a symbol Yahoo Finance knows/);
  });

  it('rejects a listing with no current price', async () => {
    await expect(
      fetchQuote('X.DE', undefined, async () => json(chart({ currency: 'EUR' }))),
    ).rejects.toThrow(/no current price/);
  });

  it('reports rate limiting in plain words', async () => {
    await expect(fetchQuote('X.DE', undefined, async () => json({}, 429))).rejects.toThrow(
      /rate-limiting/,
    );
  });

  it('rejects an empty symbol before making a request', async () => {
    let called = false;
    await expect(
      fetchQuote('  ', undefined, async () => {
        called = true;
        return json({});
      }),
    ).rejects.toThrow(/No quote symbol/);
    expect(called).toBe(false);
  });

  it('surfaces any other HTTP error', async () => {
    await expect(fetchQuote('X.DE', undefined, async () => json({}, 500))).rejects.toThrow(/500/);
  });
});

describe('currencyMismatch', () => {
  it('flags a price in another currency than the position', () => {
    expect(currencyMismatch({ symbol: 'SWDA.L', price: 1, currency: 'GBP' }, 'usd')).toMatch(
      /quoted in GBP, but the position is in USD/,
    );
  });

  it('accepts a match, or a quote with no currency', () => {
    expect(currencyMismatch({ symbol: 'A', price: 1, currency: 'USD' }, 'usd')).toBeNull();
    expect(currencyMismatch({ symbol: 'A', price: 1 }, 'USD')).toBeNull();
  });
});
