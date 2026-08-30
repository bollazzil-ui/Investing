import { describe, expect, it, vi } from 'vitest';
import { neededCurrencies, refreshAll } from './refresh';
import type { Portfolio, Position, Settings } from '../types';
import type { FxResult, QuoteResult } from './quotes';

const settings: Settings = {
  baseCurrency: 'CHF',
  cashBalances: { CHF: 1000 },
  fxRates: { USD: 0.85, EUR: 0.93 },
  rounding: 'truncate',
  allowSell: false,
  feeMode: 'all',
  allowFractionalShares: false,
  useLeftoverCash: true,
  conversionSpread: 0,
  conversionFee: 0,
};

const pos = (over: Partial<Position> = {}): Position => ({
  id: 'a',
  ticker: 'SWDA',
  name: 'iShares Core MSCI World',
  currency: 'USD',
  unitPrice: 89.84,
  shares: 100,
  targetWeight: 1,
  fee: 0,
  quoteSymbol: 'swda.uk',
  ...over,
});

const make = (positions: Position[], over: Partial<Settings> = {}): Portfolio => ({
  version: 2,
  name: 't',
  settings: { ...settings, ...over },
  positions,
});

const fxOk = (rates: Record<string, number>, missing: string[] = []): FxResult => ({
  rates,
  asOf: '2026-08-28',
  missing,
});

describe('neededCurrencies', () => {
  it('lists the foreign currencies actually held, without the base', () => {
    const p = make([pos({ currency: 'USD' }), pos({ id: 'b', currency: 'EUR' }), pos({ id: 'c', currency: 'CHF' })]);
    expect(neededCurrencies(p)).toEqual(['EUR', 'USD']);
  });

  it('is empty when everything is already in the base currency', () => {
    expect(neededCurrencies(make([pos({ currency: 'CHF' })]))).toEqual([]);
  });
});

describe('refreshAll — the happy path', () => {
  it('updates rates and prices, and reports both', async () => {
    const { portfolio, report } = await refreshAll(make([pos()]), {
      fetchFx: async () => fxOk({ USD: 0.8712 }),
      fetchPrice: async (): Promise<QuoteResult> => ({ symbol: 'swda.uk', price: 92.5 }),
    });

    expect(portfolio.settings.fxRates.USD).toBe(0.8712);
    expect(portfolio.positions[0].unitPrice).toBe(92.5);
    expect(report.clean).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.updated).toBe(2);
    expect(report.asOf).toBe('2026-08-28');
    expect(report.fx[0]).toMatchObject({ label: 'USD → CHF', status: 'updated', from: 0.85, to: 0.8712 });
    expect(report.prices[0]).toMatchObject({ label: 'SWDA', status: 'updated', from: 89.84, to: 92.5, source: 'swda.uk' });
  });

  it('marks a value that came back identical as unchanged, not updated', async () => {
    const { report } = await refreshAll(make([pos()]), {
      fetchFx: async () => fxOk({ USD: 0.85 }),
      fetchPrice: async () => ({ symbol: 'swda.uk', price: 89.84 }),
    });
    expect(report.updated).toBe(0);
    expect(report.clean).toBe(true);
    expect(report.fx[0].status).toBe('unchanged');
    expect(report.prices[0].status).toBe('unchanged');
  });

  it('never mutates the portfolio it was given', async () => {
    const original = make([pos()]);
    const snapshot = JSON.stringify(original);
    await refreshAll(original, {
      fetchFx: async () => fxOk({ USD: 0.99 }),
      fetchPrice: async () => ({ symbol: 'swda.uk', price: 1 }),
    });
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('refreshAll — naming exactly what failed', () => {
  it('names each currency when the rate service is unreachable', async () => {
    const { portfolio, report } = await refreshAll(
      make([pos({ currency: 'USD' }), pos({ id: 'b', currency: 'EUR' })]),
      {
        fetchFx: async () => {
          throw new TypeError('Failed to fetch');
        },
        fetchPrice: async () => ({ symbol: 'swda.uk', price: 92.5 }),
      },
    );

    expect(report.fx.map((i) => i.label)).toEqual(['EUR → CHF', 'USD → CHF']);
    expect(report.fx.every((i) => i.status === 'failed')).toBe(true);
    expect(report.fx[0].reason).toMatch(/could not be reached/);
    // The old rates survive, so a manual entry is never wiped by a failure.
    expect(portfolio.settings.fxRates).toEqual({ USD: 0.85, EUR: 0.93 });
    expect(report.clean).toBe(false);
    expect(report.failed).toBe(2);
  });

  it('names only the currency the service does not cover, keeping the rest', async () => {
    const { portfolio, report } = await refreshAll(
      make([pos({ currency: 'USD' }), pos({ id: 'b', currency: 'XYZ' })], { fxRates: { USD: 0.85, XYZ: 2 } }),
      {
        fetchFx: async () => fxOk({ USD: 0.88 }, ['XYZ']),
        fetchPrice: async () => ({ symbol: 'swda.uk', price: 92.5 }),
      },
    );

    expect(portfolio.settings.fxRates.USD).toBe(0.88);
    expect(portfolio.settings.fxRates.XYZ).toBe(2);
    const xyz = report.fx.find((i) => i.label.startsWith('XYZ'))!;
    expect(xyz.status).toBe('failed');
    expect(xyz.reason).toContain('XYZ');
    expect(report.fx.find((i) => i.label.startsWith('USD'))!.status).toBe('updated');
  });

  it('names the product and its symbol when a price fails', async () => {
    const { portfolio, report } = await refreshAll(make([pos({ quoteSymbol: 'swda.uk' })]), {
      fetchFx: async () => fxOk({ USD: 0.85 }),
      fetchPrice: async () => {
        throw new Error('Quote service returned 404.');
      },
    });

    expect(report.prices[0]).toMatchObject({ label: 'SWDA', status: 'failed' });
    expect(report.prices[0].reason).toContain('swda.uk');
    expect(report.prices[0].reason).toContain('404');
    // The price the user had is left alone.
    expect(portfolio.positions[0].unitPrice).toBe(89.84);
  });

  it('tries only the symbol that was set, so its failure is unambiguous', async () => {
    const tried: string[] = [];
    await refreshAll(make([pos({ quoteSymbol: 'swda.uk' })]), {
      fetchFx: async () => fxOk({ USD: 0.85 }),
      fetchPrice: async (s) => {
        tried.push(s);
        throw new Error('nope');
      },
    });
    expect(tried).toEqual(['swda.uk']);
  });

  it('falls back to the usual venues when no symbol is set, and says so', async () => {
    const tried: string[] = [];
    const { report } = await refreshAll(make([pos({ quoteSymbol: undefined })]), {
      fetchFx: async () => fxOk({ USD: 0.85 }),
      fetchPrice: async (s) => {
        tried.push(s);
        throw new Error('nope');
      },
    });
    expect(tried.length).toBeGreaterThan(1);
    expect(report.prices[0].status).toBe('failed');
    expect(report.prices[0].reason).toMatch(/Set a quote symbol/);
  });

  it('remembers a symbol that worked, so the next refresh is one request', async () => {
    const { portfolio } = await refreshAll(make([pos({ quoteSymbol: undefined, ticker: 'SWDA' })]), {
      fetchFx: async () => fxOk({ USD: 0.85 }),
      fetchPrice: async (s) => {
        if (s !== 'swda.us') throw new Error('nope');
        return { symbol: s, price: 92.5 };
      },
    });
    expect(portfolio.positions[0].quoteSymbol).toBe('swda.us');
    expect(portfolio.positions[0].unitPrice).toBe(92.5);
  });

  it('skips, rather than fails, a position with nothing to look up', async () => {
    const { report } = await refreshAll(make([pos({ ticker: '', quoteSymbol: undefined, name: 'Private holding' })]), {
      fetchFx: async () => fxOk({ USD: 0.85 }),
      fetchPrice: async () => ({ symbol: 'x', price: 1 }),
    });
    expect(report.prices[0]).toMatchObject({ label: 'Private holding', status: 'skipped' });
    expect(report.prices[0].reason).toMatch(/enter the price by hand/);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(1);
    expect(report.clean).toBe(false);
  });

  it('reports a timeout in plain words', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { report } = await refreshAll(make([pos()]), {
      fetchFx: async () => {
        throw abort;
      },
      fetchPrice: async () => {
        throw abort;
      },
    });
    expect(report.fx[0].reason).toMatch(/took too long/);
    expect(report.prices[0].reason).toMatch(/took too long/);
  });

  it('keeps every good value when only some things fail', async () => {
    const { portfolio, report } = await refreshAll(
      make([
        pos({ id: 'a', ticker: 'SWDA', quoteSymbol: 'swda.uk' }),
        pos({ id: 'b', ticker: 'EIMI', quoteSymbol: 'eimi.uk', unitPrice: 31.25 }),
      ]),
      {
        fetchFx: async () => fxOk({ USD: 0.87 }),
        fetchPrice: async (s) => {
          if (s === 'eimi.uk') throw new Error('Quote service returned 500.');
          return { symbol: s, price: 92.5 };
        },
      },
    );
    expect(portfolio.positions[0].unitPrice).toBe(92.5);
    expect(portfolio.positions[1].unitPrice).toBe(31.25);
    expect(report.updated).toBe(2); // the USD rate and SWDA
    expect(report.failed).toBe(1);
    expect(report.prices.find((i) => i.label === 'EIMI')!.reason).toContain('eimi.uk');
  });

  it('does not call the rate service when everything is in the base currency', async () => {
    const fetchFx = vi.fn();
    const { report } = await refreshAll(make([pos({ currency: 'CHF' })]), {
      fetchFx,
      fetchPrice: async () => ({ symbol: 'swda.uk', price: 92.5 }),
    });
    expect(fetchFx).not.toHaveBeenCalled();
    expect(report.fx).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it('handles an empty portfolio without complaint', async () => {
    const { report } = await refreshAll(make([]), {
      fetchFx: async () => fxOk({}),
      fetchPrice: async () => ({ symbol: 'x', price: 1 }),
    });
    expect(report.clean).toBe(true);
    expect(report.updated).toBe(0);
  });
});
