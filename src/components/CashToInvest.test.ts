import { describe, expect, it } from 'vitest';
import { cashCurrencies } from './CashToInvest';
import type { Portfolio, Position, Settings } from '../types';

const settings: Settings = {
  baseCurrency: 'CHF',
  cashBalances: {},
  fxRates: { USD: 0.85, EUR: 0.93 },
  rounding: 'truncate',
  allowSell: false,
  feeMode: 'all',
  allowFractionalShares: false,
  useLeftoverCash: true,
  conversionSpread: 0.0025,
  conversionFee: 0,
};

const pos = (currency: string, ticker = currency): Position => ({
  id: ticker,
  ticker,
  name: ticker,
  currency,
  unitPrice: 100,
  shares: 1,
  targetWeight: 0.5,
  fee: 0,
});

const make = (positions: Position[], over: Partial<Settings> = {}): Portfolio => ({
  version: 2,
  name: 't',
  settings: { ...settings, ...over },
  positions,
});

describe('cashCurrencies', () => {
  it('always leads with the base currency', () => {
    expect(cashCurrencies(make([]))[0]).toBe('CHF');
    expect(cashCurrencies(make([pos('USD')]))[0]).toBe('CHF');
  });

  it('adds a row for every currency the positions are priced in', () => {
    expect(cashCurrencies(make([pos('USD'), pos('EUR')]))).toEqual(['CHF', 'EUR', 'USD']);
  });

  it('adds a row on its own when a new currency arrives', () => {
    const before = cashCurrencies(make([pos('USD'), pos('EUR')]));
    expect(before).not.toContain('GBP');
    // The user adds a GBP-priced position…
    const after = cashCurrencies(make([pos('USD'), pos('EUR'), pos('GBP')]));
    expect(after).toEqual(['CHF', 'EUR', 'GBP', 'USD']);
  });

  it('lists a currency once however many positions use it', () => {
    expect(cashCurrencies(make([pos('USD', 'A'), pos('USD', 'B'), pos('USD', 'C')]))).toEqual([
      'CHF',
      'USD',
    ]);
  });

  it('never duplicates the base currency', () => {
    expect(cashCurrencies(make([pos('CHF'), pos('USD')]))).toEqual(['CHF', 'USD']);
  });

  it('keeps a row while it still holds cash, even with no position left', () => {
    // The GBP position was removed but the money is still there.
    const p = make([pos('USD')], { cashBalances: { GBP: 250 } });
    expect(cashCurrencies(p)).toContain('GBP');
  });

  it('drops an empty balance once no position uses that currency', () => {
    const p = make([pos('USD')], { cashBalances: { GBP: 0 } });
    expect(cashCurrencies(p)).not.toContain('GBP');
  });

  it('normalises lower-case currency codes', () => {
    expect(cashCurrencies(make([pos('usd')]))).toEqual(['CHF', 'USD']);
  });

  it('ignores a position with no currency set', () => {
    expect(cashCurrencies(make([pos('')]))).toEqual(['CHF']);
  });

  it('follows a change of base currency', () => {
    const p = make([pos('USD'), pos('CHF')], { baseCurrency: 'EUR' });
    expect(cashCurrencies(p)).toEqual(['EUR', 'CHF', 'USD']);
  });
});
