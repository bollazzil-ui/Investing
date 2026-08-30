import { describe, expect, it } from 'vitest';
import { fetchFxRates, fetchQuote } from './quotes';

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
function text(body: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
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

  it('throws when the whole request fails', async () => {
    await expect(
      fetchFxRates('CHF', ['USD'], undefined, async () => json({}, 503)),
    ).rejects.toThrow(/503/);
  });
});

describe('fetchQuote', () => {
  const csv = 'Symbol,Date,Time,Open,High,Low,Close,Volume\nEUNL.DE,2026-08-28,17:35,89.1,90.0,89.0,89.84,412300\n';

  it('reads the close price out of the CSV', async () => {
    const q = await fetchQuote('eunl.de', undefined, async () => text(csv));
    expect(q.price).toBe(89.84);
    expect(q.asOf).toBe('2026-08-28');
  });

  it('rejects a symbol the provider has no price for', async () => {
    await expect(
      fetchQuote('nope.de', undefined, async () =>
        text('Symbol,Date,Time,Open,High,Low,Close,Volume\nNOPE,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n'),
      ),
    ).rejects.toThrow(/not a known symbol/);
  });

  it('rejects an empty symbol before making a request', async () => {
    let called = false;
    await expect(
      fetchQuote('  ', undefined, async () => {
        called = true;
        return text(csv);
      }),
    ).rejects.toThrow(/No quote symbol/);
    expect(called).toBe(false);
  });

  it('surfaces an HTTP error', async () => {
    await expect(fetchQuote('x.de', undefined, async () => text('', 404))).rejects.toThrow(/404/);
  });
});
