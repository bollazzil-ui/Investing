import { describe, expect, it } from 'vitest';
import { hydrate } from './storage';

describe('hydrate — v1 portfolios', () => {
  const v1 = {
    version: 1,
    name: 'Old',
    settings: {
      baseCurrency: 'CHF',
      cash: 290.4,
      fxRates: { USD: 0.8505, EUR: 0.9315 },
      rounding: 'truncate',
      allowSell: true,
      feeMode: 'all',
      allowFractionalShares: false,
      useLeftoverCash: true,
    },
    positions: [
      { id: 'a', ticker: 'SWDA', name: 'World', currency: 'USD', unitPrice: 89.84, shares: 357, targetWeight: 0.6, fee: 20 },
    ],
  };

  it('moves the single cash number into a base-currency balance', () => {
    const p = hydrate(v1);
    expect(p.version).toBe(2);
    expect(p.settings.cashBalances).toEqual({ CHF: 290.4 });
  });

  it('keeps fee numbers as they were, now read as the position’s currency', () => {
    // The chosen migration: 20 stays 20 and now means 20 USD.
    expect(hydrate(v1).positions[0].fee).toBe(20);
  });

  it('defaults the conversion charge to a realistic spread', () => {
    const s = hydrate(v1).settings;
    expect(s.conversionSpread).toBeCloseTo(0.0025, 8);
    expect(s.conversionFee).toBe(0);
  });
});

describe('hydrate — robustness', () => {
  it('fills in everything for an empty object', () => {
    const p = hydrate({});
    expect(p.version).toBe(2);
    expect(p.settings.baseCurrency).toBe('CHF');
    expect(p.settings.cashBalances).toEqual({});
    expect(p.positions).toEqual([]);
  });

  it('uppercases balance codes and drops nonsense amounts', () => {
    const p = hydrate({ settings: { cashBalances: { usd: 100, eur: 'abc', gbp: -5, chf: 0 } } });
    expect(p.settings.cashBalances).toEqual({ USD: 100, CHF: 0 });
  });

  it('prefers explicit balances over a legacy cash field', () => {
    const p = hydrate({ settings: { baseCurrency: 'CHF', cash: 999, cashBalances: { USD: 100 } } });
    expect(p.settings.cashBalances).toEqual({ USD: 100 });
  });

  it('puts legacy cash in the right currency for a non-CHF base', () => {
    const p = hydrate({ settings: { baseCurrency: 'eur', cash: 500 } });
    expect(p.settings.baseCurrency).toBe('EUR');
    expect(p.settings.cashBalances).toEqual({ EUR: 500 });
  });

  it('survives junk without throwing', () => {
    for (const junk of [null, undefined, 'text', 42, [], { positions: 'no' }]) {
      expect(() => hydrate(junk)).not.toThrow();
      expect(hydrate(junk).version).toBe(2);
    }
  });
});
