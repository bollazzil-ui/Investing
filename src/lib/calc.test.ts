import { describe, expect, it } from 'vitest';
import { calculate, normalizeWeights, planTrade, roundShares } from './calc';
import type { Portfolio, Position, Settings } from '../types';

/**
 * Golden values taken from the original "Aufteilungsrechner.xlsx".
 *
 * The spreadsheet holds each position's CHF value as its own input (D6:D8),
 * independent of shares × price. This app derives value from shares × price
 * instead, so the two are pinned separately:
 *   - the allocation chain is checked with positions priced to hit D6:D8 exactly
 *   - the share/rounding chain is checked through planTrade with the sheet's
 *     own Diff and price inputs
 */

const USD = 0.8505;
const EUR = 0.9315;

const sheetSettings: Settings = {
  baseCurrency: 'CHF',
  cash: 290.4, // D11 "Liquider Teil"
  fxRates: { USD, EUR },
  rounding: 'truncate',
  allowSell: true,
  feeMode: 'all',
  allowFractionalShares: false,
};

/** A position whose shares × price equals `value` exactly. */
function valued(id: string, value: number, targetWeight: number, fee: number): Position {
  return {
    id,
    ticker: id,
    name: id,
    currency: 'CHF',
    unitPrice: value,
    shares: 1,
    targetWeight,
    fee,
  };
}

describe('allocation chain vs. spreadsheet', () => {
  // E2 = 14% small caps, E3 = 70% developed. E8 = 0.99 * E2 * E3, E7 = E3 - E8.
  const IUSN_TARGET = (0.99 / 1) * 0.14 * 0.7; // 0.09702
  const SWDA_TARGET = 0.7 - IUSN_TARGET; // 0.60298

  const portfolio: Portfolio = {
    version: 1,
    name: 'sheet',
    settings: sheetSettings,
    positions: [
      valued('EIMI', 13714.73, 0.3, 20), // D6, E6, H13
      valued('SWDA', 27285.38, SWDA_TARGET, 20), // D7, E7, H14
      valued('IUSN', 4433.55, IUSN_TARGET, 38), // D8, E8, H15
    ],
  };

  const r = calculate(portfolio);

  it('sums the current holdings (D9)', () => {
    expect(r.currentTotal).toBeCloseTo(45433.66, 8);
  });

  it('sums the fees (H16)', () => {
    expect(r.feesTotal).toBe(78);
  });

  it('computes the investable total: holdings + cash − fees (Q6)', () => {
    expect(r.investable).toBeCloseTo(45646.06, 8);
  });

  it('computes each target value, the "Soll" (Q7:Q9)', () => {
    expect(r.positions[0].targetValue).toBeCloseTo(13693.818, 8);
    expect(r.positions[1].targetValue).toBeCloseTo(27523.6612588, 8);
    expect(r.positions[2].targetValue).toBeCloseTo(4428.5807412, 8);
  });

  it('computes each delta, the "Diff zu Soll" (Q10:Q12)', () => {
    expect(r.positions[0].deltaValue).toBeCloseTo(-20.912, 8);
    expect(r.positions[1].deltaValue).toBeCloseTo(238.2812588, 8);
    expect(r.positions[2].deltaValue).toBeCloseTo(-4.9692588, 8);
  });

  it('reproduces the actual percentages (F6:F8)', () => {
    expect(r.positions[0].actualWeight).toBeCloseTo(0.30186275990091926, 12);
    expect(r.positions[1].actualWeight).toBeCloseTo(0.60055430269100052, 12);
    expect(r.positions[2].actualWeight).toBeCloseTo(0.097582937408080273, 12);
  });

  it('reports no warnings for a well-formed portfolio', () => {
    expect(r.warnings).toEqual([]);
  });
});

describe('trade planning vs. spreadsheet', () => {
  // Unit prices D19:D21 converted to CHF (E19:E21).
  const eimiPrice = 31.25 * USD; // 26.578125
  const swdaPrice = 89.84 * USD; // 76.40892
  const iusnPrice = 6.324 * EUR; // 5.890806

  const opts = { rounding: 'truncate' as const, allowSell: true, allowFractionalShares: false };

  it('computes the raw share counts (Q19:Q21)', () => {
    expect(planTrade(-20.912, eimiPrice, opts).rawShares).toBeCloseTo(-0.78681246325684917, 12);
    expect(planTrade(238.2812588, swdaPrice, opts).rawShares).toBeCloseTo(3.1185005467948179, 12);
    expect(planTrade(-4.9692588, iusnPrice, opts).rawShares).toBeCloseTo(-0.84356178084965061, 12);
  });

  it('rounds down toward zero like ROUNDDOWN (E24:E26)', () => {
    expect(planTrade(-20.912, eimiPrice, opts).tradeShares).toBe(0);
    expect(planTrade(238.2812588, swdaPrice, opts).tradeShares).toBe(3);
    expect(planTrade(-4.9692588, iusnPrice, opts).tradeShares).toBe(0);
  });

  it('computes the traded amount in CHF (G24:G26)', () => {
    expect(planTrade(-20.912, eimiPrice, opts).tradeValueBase).toBe(0);
    expect(planTrade(238.2812588, swdaPrice, opts).tradeValueBase).toBeCloseTo(229.22676, 8);
    expect(planTrade(-4.9692588, iusnPrice, opts).tradeValueBase).toBe(0);
  });
});

describe('roundShares', () => {
  it('truncates toward zero, matching Excel ROUNDDOWN', () => {
    expect(roundShares(3.9, 'truncate')).toBe(3);
    expect(roundShares(-3.9, 'truncate')).toBe(-3);
  });

  it('floors toward negative infinity', () => {
    expect(roundShares(3.9, 'floor')).toBe(3);
    expect(roundShares(-3.1, 'floor')).toBe(-4);
  });

  it('rounds to nearest', () => {
    expect(roundShares(3.6, 'nearest')).toBe(4);
    expect(roundShares(-3.6, 'nearest')).toBe(-4);
  });
});

describe('constraints', () => {
  const p = (over: Partial<Position> = {}): Position => ({
    id: 'a',
    ticker: 'A',
    name: 'A',
    currency: 'CHF',
    unitPrice: 100,
    shares: 10,
    targetWeight: 0.5,
    fee: 0,
    ...over,
  });

  it('never sells when allowSell is off', () => {
    const plan = planTrade(-500, 100, {
      rounding: 'truncate',
      allowSell: false,
      allowFractionalShares: false,
    });
    expect(plan.tradeShares).toBe(0);
    expect(plan.action).toBe('hold');
  });

  it('keeps fractional shares when the broker allows them', () => {
    const plan = planTrade(250, 100, {
      rounding: 'truncate',
      allowSell: true,
      allowFractionalShares: true,
    });
    expect(plan.tradeShares).toBeCloseTo(2.5, 8);
  });

  it('never trades a locked position but still counts its value', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...sheetSettings, cash: 0, fxRates: {} },
      positions: [p({ id: 'a', locked: true, fee: 25 }), p({ id: 'b', ticker: 'B', shares: 30 })],
    });
    expect(r.currentTotal).toBe(4000);
    expect(r.positions[0].tradeShares).toBe(0);
    expect(r.positions[0].feeApplied).toBe(0);
    expect(r.feesTotal).toBe(0);
  });

  it('charges a fee only for positions actually traded in "traded" mode', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...sheetSettings, cash: 0, fxRates: {}, feeMode: 'traded' },
      // b is already exactly on target, so it should not be charged.
      positions: [
        p({ id: 'a', shares: 5, targetWeight: 0.5, fee: 10 }),
        p({ id: 'b', ticker: 'B', shares: 15, targetWeight: 0.5, fee: 10 }),
      ],
    });
    const charged = r.positions.filter((x) => x.feeApplied > 0).map((x) => x.ticker);
    expect(charged).toEqual(['A', 'B']);
    expect(r.feesTotal).toBe(20);
  });

  it('warns when target weights do not add up to 100%', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...sheetSettings, cash: 0, fxRates: {} },
      positions: [p({ targetWeight: 0.4 }), p({ id: 'b', ticker: 'B', targetWeight: 0.4 })],
    });
    expect(r.warnings.join(' ')).toContain('80.00%');
  });

  it('converts a foreign-currency trade back into its own currency', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...sheetSettings, cash: 1000, fxRates: { USD } },
      positions: [p({ currency: 'USD', unitPrice: 100, shares: 10, targetWeight: 1, fee: 0 })],
    });
    const only = r.positions[0];
    expect(only.priceBase).toBeCloseTo(85.05, 8);
    expect(only.tradeValueLocal).toBeCloseTo(only.tradeValueBase / USD, 8);
  });
});

describe('normalizeWeights', () => {
  it('scales weights to sum to 1', () => {
    const out = normalizeWeights([
      { ...({ id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 1, shares: 1, fee: 0 } as Position), targetWeight: 0.4 },
      { ...({ id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 1, shares: 1, fee: 0 } as Position), targetWeight: 0.4 },
    ]);
    expect(out[0].targetWeight + out[1].targetWeight).toBeCloseTo(1, 12);
    expect(out[0].targetWeight).toBeCloseTo(0.5, 12);
  });

  it('falls back to equal weights when everything is zero', () => {
    const out = normalizeWeights([
      { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 1, shares: 1, fee: 0, targetWeight: 0 },
      { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 1, shares: 1, fee: 0, targetWeight: 0 },
    ]);
    expect(out.map((x) => x.targetWeight)).toEqual([0.5, 0.5]);
  });
});
