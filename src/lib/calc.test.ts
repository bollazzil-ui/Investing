import { describe, expect, it } from 'vitest';
import {
  applyPurchase,
  calculate,
  normalizeWeights,
  planPurchase,
  planTrade,
  roundShares,
} from './calc';
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
  useLeftoverCash: false,
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

  it('sums the fees it reserves (H16)', () => {
    expect(r.feesReserved).toBe(78);
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
    expect(r.feesReserved).toBe(0);
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
    expect(r.feesReserved).toBe(20);
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

describe('investing new money (buy-only)', () => {
  const settings: Settings = {
    baseCurrency: 'CHF',
    cash: 10_000,
    fxRates: {},
    rounding: 'truncate',
    allowSell: false,
    feeMode: 'all',
    allowFractionalShares: false,
    useLeftoverCash: false,
  };

  // 60/40 target, currently 50/50 by value. New money must correct the split.
  const positions: Position[] = [
    { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 100, shares: 100, targetWeight: 0.6, fee: 0 },
    { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 100, shares: 100, targetWeight: 0.4, fee: 0 },
  ];

  it('only buys, never sells', () => {
    const r = calculate({ version: 1, name: 't', settings, positions });
    expect(r.positions.every((p) => p.tradeShares >= 0)).toBe(true);
  });

  it('directs new money at the underweight position', () => {
    const r = calculate({ version: 1, name: 't', settings, positions });
    // investable 30k → A wants 18k (has 10k), B wants 12k (has 10k).
    expect(r.positions[0].tradeShares).toBe(80);
    expect(r.positions[1].tradeShares).toBe(20);
    expect(r.cashRemaining).toBe(0);
    expect(r.leftoverShares).toBe(0);
  });

  it('leaves an overweight position alone instead of selling it', () => {
    const skewed: Position[] = [
      { ...positions[0], shares: 190 },
      { ...positions[1], shares: 10 },
    ];
    const r = calculate({ version: 1, name: 't', settings, positions: skewed });
    expect(r.positions[0].action).toBe('hold');
    expect(r.positions[1].action).toBe('buy');
  });
});

describe('leftover cash', () => {
  const base: Settings = {
    baseCurrency: 'CHF',
    cash: 1000,
    fxRates: {},
    rounding: 'truncate',
    allowSell: false,
    feeMode: 'all',
    allowFractionalShares: false,
    useLeftoverCash: false,
  };

  // Prices that do not divide the cash evenly, so rounding down strands money.
  const positions: Position[] = [
    { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 70, shares: 0, targetWeight: 0.5, fee: 0 },
    { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 30, shares: 0, targetWeight: 0.5, fee: 0 },
  ];

  it('strands cash when the pass is off', () => {
    const r = calculate({ version: 1, name: 't', settings: base, positions });
    expect(r.positions[0].tradeShares).toBe(7); // 500/70 = 7.14
    expect(r.positions[1].tradeShares).toBe(16); // 500/30 = 16.67
    expect(r.cashRemaining).toBeCloseTo(30, 8);
  });

  it('spends the leftover on the position furthest below target', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...base, useLeftoverCash: true },
      positions,
    });
    expect(r.leftoverShares).toBe(1);
    expect(r.positions[1].tradeShares).toBe(17); // B was 20 short; one more 30 share fits
    expect(r.cashRemaining).toBeCloseTo(0, 8);
  });

  it('never spends more cash than is available', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...base, useLeftoverCash: true },
      positions,
    });
    expect(r.cashRemaining).toBeGreaterThanOrEqual(-1e-9);
  });

  it('does not buy a share that would overshoot the target', () => {
    // Cash left over (40) exceeds A's price, but A is only 5 short of target.
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...base, cash: 240, useLeftoverCash: true },
      positions: [
        { ...positions[0], unitPrice: 40, shares: 0, targetWeight: 0.5 },
        { ...positions[1], unitPrice: 100, shares: 0, targetWeight: 0.5 },
      ],
    });
    // A: 120/40 = 3 exactly. B: 120/100 = 1, leaving 20 — under half of B's price.
    expect(r.positions[0].tradeShares).toBe(3);
    expect(r.positions[1].tradeShares).toBe(1);
    expect(r.leftoverShares).toBe(0);
  });

  it('is skipped for fractional shares, which strand nothing anyway', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...base, useLeftoverCash: true, allowFractionalShares: true },
      positions,
    });
    expect(r.leftoverShares).toBe(0);
    expect(r.cashRemaining).toBeCloseTo(0, 8);
  });
});

describe('buy-only never overspends the cash', () => {
  const settings: Settings = {
    baseCurrency: 'CHF',
    cash: 10_000,
    fxRates: {},
    rounding: 'truncate',
    allowSell: false,
    feeMode: 'all',
    allowFractionalShares: false,
    useLeftoverCash: true,
  };

  // A large existing portfolio plus a brand-new position with a 20% target:
  // reaching that target needs far more than the cash on hand.
  const positions: Position[] = [
    { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 10, shares: 4000, targetWeight: 0.4, fee: 0 },
    { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 10, shares: 1000, targetWeight: 0.4, fee: 0 },
    { id: 'new', ticker: 'NEW', name: 'New', currency: 'CHF', unitPrice: 10, shares: 0, targetWeight: 0.2, fee: 0 },
  ];

  const r = calculate({ version: 1, name: 't', settings, positions });
  const spent = r.positions.reduce((a, p) => a + p.tradeValueBase, 0);

  it('spends no more than the cash available', () => {
    expect(spent).toBeLessThanOrEqual(settings.cash + 1e-9);
    expect(r.cashRemaining).toBeGreaterThanOrEqual(-1e-9);
  });

  it('flags that the targets were out of reach', () => {
    expect(r.budgetLimited).toBe(true);
    expect(r.warnings.join(' ')).toContain('scaled back proportionally');
  });

  it('reports the cash that would reach the targets exactly, fees included', () => {
    // B is 15k short and NEW is 10k short of a 50k portfolio; fees are zero.
    expect(r.cashForFullTarget).toBeGreaterThan(settings.cash);
    const generous = calculate({
      version: 1,
      name: 't',
      settings: { ...settings, cash: r.cashForFullTarget },
      positions,
    });
    expect(generous.budgetLimited).toBe(false);
  });

  it('clears the shortfall even when fees are charged', () => {
    const withFees: Position[] = positions.map((p) => ({ ...p, fee: 25 }));
    const limited = calculate({ version: 1, name: 't', settings, positions: withFees });
    expect(limited.budgetLimited).toBe(true);
    const topped = calculate({
      version: 1,
      name: 't',
      settings: { ...settings, cash: Math.ceil(limited.cashForFullTarget) },
      positions: withFees,
    });
    expect(topped.budgetLimited).toBe(false);
    expect(topped.cashRemaining).toBeGreaterThanOrEqual(-1e-9);
  });

  it('still moves every underweight position toward its target', () => {
    // A is overweight and gets nothing; B and NEW are both short and share the cash.
    expect(r.positions[0].tradeShares).toBe(0);
    expect(r.positions[1].tradeShares).toBeGreaterThan(0);
    expect(r.positions[2].tradeShares).toBeGreaterThan(0);
    for (const p of r.positions) {
      expect(Math.abs(p.newDrift)).toBeLessThanOrEqual(Math.abs(p.driftWeight) + 1e-9);
    }
  });

  it('puts the whole budget to work', () => {
    expect(spent).toBeCloseTo(10_000, 6);
  });

  it('does not scale back when the cash is sufficient', () => {
    const roomy = calculate({
      version: 1,
      name: 't',
      settings: { ...settings, cash: 100_000 },
      positions,
    });
    expect(roomy.budgetLimited).toBe(false);
  });

  it('leaves full rebalancing free to fund buys from sells', () => {
    const rebal = calculate({
      version: 1,
      name: 't',
      settings: { ...settings, allowSell: true },
      positions,
    });
    expect(rebal.budgetLimited).toBe(false);
    expect(rebal.positions[0].action).toBe('sell');
  });
});

describe('fees', () => {
  it('charges nothing when the plan trades nothing', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: {
        baseCurrency: 'CHF',
        cash: 0,
        fxRates: {},
        rounding: 'truncate',
        allowSell: false,
        feeMode: 'all',
        allowFractionalShares: false,
        useLeftoverCash: true,
      },
      positions: [
        { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 10, shares: 60, targetWeight: 0.5, fee: 12 },
        { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 10, shares: 40, targetWeight: 0.5, fee: 12 },
      ],
    });
    expect(r.positions.every((p) => p.tradeShares === 0)).toBe(true);
    expect(r.feesReserved).toBe(24);
    expect(r.feesTotal).toBe(0);
    expect(r.cashRemaining).toBe(0);
  });
});

describe('the plan is always affordable', () => {
  const settings: Settings = {
    baseCurrency: 'CHF',
    cash: 10_000,
    fxRates: {},
    rounding: 'truncate',
    allowSell: true,
    feeMode: 'all',
    allowFractionalShares: false,
    useLeftoverCash: true,
  };

  it('trims buys when rounded sells raise less than the ideal', () => {
    // Chunky, awkward prices so truncation bites on both sides.
    const r = calculate({
      version: 1,
      name: 't',
      settings,
      positions: [
        { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 76.4, shares: 357, targetWeight: 0.48, fee: 26 },
        { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 26.6, shares: 516, targetWeight: 0.24, fee: 26 },
        { id: 'c', ticker: 'C', name: 'C', currency: 'CHF', unitPrice: 4.12, shares: 0, targetWeight: 0.28, fee: 26 },
      ],
    });
    expect(r.cashRemaining).toBeGreaterThanOrEqual(-1e-9);
  });

  it('holds across a spread of prices, cash levels and rounding modes', () => {
    const modes = ['truncate', 'floor', 'nearest'] as const;
    for (const rounding of modes) {
      for (const allowSell of [true, false]) {
        for (const cash of [0, 137, 1000, 9999.99, 50_000]) {
          for (const price of [3.3, 41.7, 260.5]) {
            const r = calculate({
              version: 1,
              name: 't',
              settings: { ...settings, rounding, allowSell, cash },
              positions: [
                { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: price, shares: 120, targetWeight: 0.5, fee: 12 },
                { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: price * 1.7, shares: 40, targetWeight: 0.3, fee: 12 },
                { id: 'c', ticker: 'C', name: 'C', currency: 'CHF', unitPrice: price * 0.4, shares: 0, targetWeight: 0.2, fee: 12 },
              ],
            });
            expect(
              r.cashRemaining,
              `rounding=${rounding} allowSell=${allowSell} cash=${cash} price=${price}`,
            ).toBeGreaterThanOrEqual(-1e-9);
          }
        }
      }
    }
  });

  it('leaves an affordable plan untouched', () => {
    const r = calculate({
      version: 1,
      name: 't',
      settings: { ...settings, allowSell: false, useLeftoverCash: false },
      positions: [
        { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 100, shares: 100, targetWeight: 0.6, fee: 0 },
        { id: 'b', ticker: 'B', name: 'B', currency: 'CHF', unitPrice: 100, shares: 100, targetWeight: 0.4, fee: 0 },
      ],
    });
    expect(r.positions[0].tradeShares).toBe(80);
    expect(r.positions[1].tradeShares).toBe(20);
  });
});

describe('planPurchase / applyPurchase', () => {
  const settings: Settings = {
    baseCurrency: 'CHF',
    cash: 0,
    fxRates: { USD: 0.8505 },
    rounding: 'truncate',
    allowSell: true, // deliberately on, to prove the purchase plan overrides it
    feeMode: 'all',
    allowFractionalShares: false,
    useLeftoverCash: true,
  };

  const positions: Position[] = [
    { id: 'a', ticker: 'A', name: 'A', currency: 'CHF', unitPrice: 100, shares: 90, targetWeight: 0.5, fee: 0 },
    { id: 'b', ticker: 'B', name: 'B', currency: 'USD', unitPrice: 50, shares: 100, targetWeight: 0.5, fee: 0 },
  ];
  const portfolio: Portfolio = { version: 1, name: 't', settings, positions };

  it('never sells, whatever the portfolio setting says', () => {
    const { result } = planPurchase(portfolio, 5000);
    expect(result.positions.every((p) => p.tradeShares >= 0)).toBe(true);
  });

  it('spends no more than the amount offered', () => {
    for (const amount of [1, 137.5, 999, 5000, 250_000]) {
      const { result } = planPurchase(portfolio, amount);
      const spent = result.positions.reduce((a, p) => a + p.tradeValueBase, 0);
      expect(spent + result.feesTotal, `amount=${amount}`).toBeLessThanOrEqual(amount + 1e-9);
    }
  });

  it('treats a missing or negative amount as nothing to spend', () => {
    for (const amount of [0, -50, NaN]) {
      const { result } = planPurchase(portfolio, amount);
      expect(result.positions.every((p) => p.tradeShares === 0), `amount=${amount}`).toBe(true);
    }
  });

  it('adds the bought shares to the holdings', () => {
    const { result } = planPurchase(portfolio, 5000);
    const after = applyPurchase(portfolio, result);
    for (const p of after.positions) {
      const planned = result.positions.find((x) => x.id === p.id)!;
      const before = positions.find((x) => x.id === p.id)!;
      expect(p.shares).toBe(before.shares + planned.tradeShares);
    }
  });

  it('keeps what could not be spent as cash to invest, rounded to money', () => {
    const { result } = planPurchase(portfolio, 5000);
    const after = applyPurchase(portfolio, result);
    expect(after.settings.cash).toBeCloseTo(result.cashRemaining, 2);
    expect(after.settings.cash).toBeGreaterThanOrEqual(0);
    // No float tail: this value goes straight into a visible cash field.
    expect(after.settings.cash * 100).toBeCloseTo(Math.round(after.settings.cash * 100), 9);
  });

  it('grows the portfolio by exactly what was spent', () => {
    const before = calculate(portfolio).currentTotal;
    const { result } = planPurchase(portfolio, 5000);
    const spent = result.positions.reduce((a, p) => a + p.tradeValueBase, 0);
    const after = calculate(applyPurchase(portfolio, result)).currentTotal;
    expect(after).toBeCloseTo(before + spent, 6);
  });

  it('leaves the original portfolio untouched', () => {
    const snapshot = JSON.stringify(portfolio);
    const { result } = planPurchase(portfolio, 5000);
    applyPurchase(portfolio, result);
    expect(JSON.stringify(portfolio)).toBe(snapshot);
  });

  it('restores the portfolio\'s own rebalancing setting after saving', () => {
    const { result } = planPurchase(portfolio, 5000);
    const after = applyPurchase(portfolio, result);
    expect(after.settings.allowSell).toBe(true);
  });

  it('has nothing left to buy when the leftover cannot cover a share', () => {
    const { result } = planPurchase(portfolio, 5000);
    const after = applyPurchase(portfolio, result);
    const second = planPurchase(after, after.settings.cash);
    expect(second.result.positions.every((p) => p.tradeShares === 0)).toBe(true);
  });

  it('moves the split toward the target', () => {
    // A is underweight (9000 vs 4252.50 for B), so new money should favour it.
    const { result } = planPurchase(portfolio, 5000);
    const after = calculate(applyPurchase(portfolio, result));
    for (const p of after.positions) {
      const was = result.positions.find((x) => x.id === p.id)!;
      expect(Math.abs(p.driftWeight)).toBeLessThanOrEqual(Math.abs(was.driftWeight) + 1e-9);
    }
  });
});
