import type {
  CalcResult,
  Portfolio,
  Position,
  PositionResult,
  RoundingMode,
  Settings,
  TradeAction,
} from '../types';

/** Weights closer than this to 1 are treated as summing to exactly 100%. */
export const WEIGHT_SUM_TOLERANCE = 1e-6;

/**
 * Rounds a raw share count to a tradable one.
 *
 * `truncate` reproduces Excel's ROUNDDOWN, which rounds toward zero — so a
 * fractional sell of −0.79 shares becomes 0 rather than −1. That is what keeps
 * the original spreadsheet from selling on tiny negative drifts.
 */
export function roundShares(raw: number, mode: RoundingMode): number {
  if (!Number.isFinite(raw)) return 0;
  let rounded: number;
  switch (mode) {
    case 'truncate':
      rounded = Math.trunc(raw);
      break;
    case 'floor':
      rounded = Math.floor(raw);
      break;
    case 'nearest':
      rounded = Math.round(raw);
      break;
  }
  // Math.trunc(-0.5) is -0, which would render as "-0 shares".
  return rounded === 0 ? 0 : rounded;
}

export interface TradePlan {
  rawShares: number;
  tradeShares: number;
  tradeValueBase: number;
  action: TradeAction;
}

/**
 * Turns a value delta into a concrete share trade.
 *
 * Exported on its own so the rounding rules can be tested directly against the
 * numbers the original spreadsheet produced.
 */
export function planTrade(
  deltaValue: number,
  priceBase: number,
  opts: { rounding: RoundingMode; allowSell: boolean; allowFractionalShares: boolean; locked?: boolean },
): TradePlan {
  if (opts.locked || !(priceBase > 0) || !Number.isFinite(deltaValue)) {
    return { rawShares: 0, tradeShares: 0, tradeValueBase: 0, action: 'hold' };
  }
  const rawShares = deltaValue / priceBase;
  const constrained = !opts.allowSell && rawShares < 0 ? 0 : rawShares;
  const tradeShares = opts.allowFractionalShares
    ? roundTo(constrained, 6)
    : roundShares(constrained, opts.rounding);
  const tradeValueBase = tradeShares === 0 ? 0 : tradeShares * priceBase;
  const action: TradeAction = tradeShares > 0 ? 'buy' : tradeShares < 0 ? 'sell' : 'hold';
  return { rawShares, tradeShares, tradeValueBase, action };
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const rounded = Math.round(value * f) / f;
  return rounded === 0 ? 0 : rounded;
}

/** Units of base currency per 1 unit of `currency`. Unknown currencies fall back to 1. */
export function fxRate(settings: Settings, currency: string): number {
  if (currency === settings.baseCurrency) return 1;
  const rate = settings.fxRates[currency];
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

export function priceInBase(settings: Settings, position: Position): number {
  return position.unitPrice * fxRate(settings, position.currency);
}

export function positionValue(settings: Settings, position: Position): number {
  return position.shares * priceInBase(settings, position);
}


/** Units of the base currency held across every cash balance. */
export function cashTotalBase(settings: Settings): number {
  return sum(
    Object.entries(settings.cashBalances ?? {}).map(([code, amount]) =>
      Number.isFinite(amount) && amount > 0 ? amount * fxRate(settings, code) : 0,
    ),
  );
}

/** A position's fee expressed in the base currency. */
export function feeInBase(settings: Settings, position: Position): number {
  return Number.isFinite(position.fee) ? position.fee * fxRate(settings, position.currency) : 0;
}

export interface Conversion {
  currency: string;
  amount: number;
}

/**
 * What it costs to fund `spend` (per currency, in that currency's own units)
 * out of the cash balances.
 *
 * Balances are pooled, so any of them can pay for anything — but the part of a
 * purchase that the matching balance cannot cover has to be converted, and
 * that is charged a spread plus a flat fee per currency converted.
 */
export function conversionCostFor(
  settings: Settings,
  spend: Record<string, number>,
): { cost: number; converted: Conversion[] } {
  const spread = Number.isFinite(settings.conversionSpread) ? settings.conversionSpread : 0;
  const flat = Number.isFinite(settings.conversionFee) ? settings.conversionFee : 0;
  const converted: Conversion[] = [];
  let cost = 0;

  for (const [code, amount] of Object.entries(spend)) {
    if (!(amount > 1e-9)) continue;
    const held = settings.cashBalances?.[code] ?? 0;
    const short = amount - Math.max(0, held);
    if (short <= 1e-9) continue;
    converted.push({ currency: code, amount: short });
    cost += short * fxRate(settings, code) * spread + flat;
  }
  return { cost, converted: converted.sort((a, b) => a.currency.localeCompare(b.currency)) };
}

/**
 * Settles a plan against the cash balances and returns what is left of each.
 *
 * The matching balance is drained first — the cheapest way to pay, since it
 * needs no conversion — and only the remainder is drawn from the others, base
 * currency first and then largest balance first, so the outcome is
 * predictable from the numbers on screen.
 */
export function settleBalances(
  settings: Settings,
  spend: Record<string, number>,
  conversionCost: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, amount] of Object.entries(settings.cashBalances ?? {})) {
    out[code] = Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  // A currency with no balance can still receive sale proceeds.
  for (const code of Object.keys(spend)) out[code] ??= 0;

  let drawBase = conversionCost;
  for (const [code, amount] of Object.entries(spend)) {
    if (amount < 0) {
      // Proceeds from a sale land in that currency.
      out[code] = (out[code] ?? 0) - amount;
      continue;
    }
    if (amount === 0) continue;
    const native = Math.min(amount, out[code] ?? 0);
    if (native > 0) out[code] = (out[code] ?? 0) - native;
    drawBase += (amount - native) * fxRate(settings, code);
  }

  const baseCode = settings.baseCurrency.toUpperCase();
  const order = Object.keys(out).sort((a, b) => {
    if (a === baseCode) return -1;
    if (b === baseCode) return 1;
    return out[b] * fxRate(settings, b) - out[a] * fxRate(settings, a);
  });

  for (const code of order) {
    if (drawBase <= 1e-9) break;
    const rate = fxRate(settings, code);
    const availableBase = out[code] * rate;
    const takeBase = Math.min(availableBase, drawBase);
    out[code] -= takeBase / rate;
    drawBase -= takeBase;
  }

  for (const code of Object.keys(out)) {
    out[code] = Math.max(0, roundTo(out[code], 6));
  }
  return out;
}

/**
 * The full rebalancing calculation.
 *
 * The chain mirrors the original spreadsheet:
 *   investable = current holdings + new cash − fees
 *   target     = investable × target weight        ("Soll")
 *   delta      = target − current value            ("Diff zu Soll")
 *   shares     = round(delta / price in base)
 *
 * With `feeMode: 'traded'` the fee total depends on which positions end up
 * being traded, which in turn depends on the fee total. That loop is resolved
 * by iterating to a fixed point (it converges in one or two passes, because
 * fees only ever shrink the investable amount).
 */
export function calculate(portfolio: Portfolio): CalcResult {
  const { settings, positions } = portfolio;
  const warnings: string[] = [];

  const base = positions.map((p) => {
    const priceBase = priceInBase(settings, p);
    return { p, priceBase, valueBase: p.shares * priceBase };
  });

  const currentTotal = sum(base.map((b) => b.valueBase));
  const targetWeightSum = sum(positions.map((p) => p.targetWeight));
  const cash = cashTotalBase(settings);

  const tradableFees = (ids: Set<string> | null) =>
    sum(
      positions
        .filter((p) => !p.locked && (ids === null || ids.has(p.id)))
        .map((p) => feeInBase(settings, p)),
    );

  /**
   * What a plan spends in each currency, in that currency's own units, fees
   * included — the input to the conversion cost.
   */
  const spendOf = (ps: TradePlan[]): Record<string, number> => {
    const spend: Record<string, number> = {};
    base.forEach((b, i) => {
      const code = b.p.currency.toUpperCase();
      const rate = fxRate(settings, b.p.currency);
      // Signed: a sell is negative, i.e. proceeds flowing back into that
      // currency. Dropping them would settle the gross buys instead of the net.
      const value = rate > 0 ? ps[i].tradeValueBase / rate : 0;
      if (value !== 0) spend[code] = (spend[code] ?? 0) + value;
      // Fees follow the same rule as `feesTotal`: charged only where a trade
      // actually happens, whatever the fee mode reserved up front.
      if (!b.p.locked && ps[i].tradeShares !== 0 && b.p.fee > 0) {
        spend[code] = (spend[code] ?? 0) + b.p.fee;
      }
    });
    return spend;
  };

  // Fixed point over fees, conversion cost and the plan: each depends on the
  // others, and all of them only ever shrink the investable amount, so this
  // settles in a pass or two.
  let feesTotal = tradableFees(null);
  let conversionCost = 0;
  let converted: Conversion[] = [];
  let plans: TradePlan[] = [];
  let investable = 0;
  let budgetLimited = false;
  for (let pass = 0; pass < 12; pass += 1) {
    investable = currentTotal + cash - feesTotal - conversionCost;
    const deltas = base.map((b) => investable * b.p.targetWeight - b.valueBase);

    // When selling is off, sells cannot fund the buys, so the plan has to fit
    // inside the new cash. If the combined shortfall is larger than the budget,
    // every buy is scaled back by the same factor — each underweight position
    // moves the same fraction of the way to its target, and none is starved.
    if (!settings.allowSell) {
      const budget = Math.max(0, cash - feesTotal - conversionCost);
      const wanted = sum(
        deltas.map((d, i) => (base[i].p.locked || d <= 0 ? 0 : d)),
      );
      if (wanted > budget + 1e-9) {
        budgetLimited = true;
        const scale = wanted > 0 ? budget / wanted : 0;
        for (let i = 0; i < deltas.length; i += 1) {
          if (deltas[i] > 0) deltas[i] *= scale;
        }
      }
    }

    plans = base.map((b, i) =>
      planTrade(deltas[i], b.priceBase, {
        rounding: settings.rounding,
        allowSell: settings.allowSell,
        allowFractionalShares: settings.allowFractionalShares,
        locked: b.p.locked,
      }),
    );
    const tradedIds = new Set(
      base.filter((_b, i) => plans[i].tradeShares !== 0).map((b) => b.p.id),
    );
    const nextFees =
      settings.feeMode === 'traded' ? tradableFees(tradedIds) : feesTotal;
    const nextConversion = conversionCostFor(settings, spendOf(plans));
    const settled =
      Math.abs(nextFees - feesTotal) < 1e-9 &&
      Math.abs(nextConversion.cost - conversionCost) < 1e-9;
    feesTotal = nextFees;
    conversionCost = nextConversion.cost;
    converted = nextConversion.converted;
    if (settled) break;
  }

  // Rounding down leaves a little cash unspent against every position at once.
  // This pass puts it to work: repeatedly buy one more whole share of whichever
  // position is furthest below its target, as long as that share brings it
  // closer to target (deficit above half a share) and the cash covers it.
  let leftoverShares = 0;
  if (settings.useLeftoverCash && !settings.allowFractionalShares) {
    const tradedAlready = new Set(
      base.filter((_b, i) => plans[i].tradeShares !== 0).map((b) => b.p.id),
    );
    const spendableNow = () =>
      cash -
      tradableFees(new Set(base.filter((_b, i) => plans[i].tradeShares !== 0).map((b) => b.p.id))) -
      conversionCostFor(settings, spendOf(plans)).cost -
      sum(plans.map((pl) => pl.tradeValueBase));
    let remaining = spendableNow();

    for (let guard = 0; guard < 10_000; guard += 1) {
      let bestIndex = -1;
      let bestDeficit = 0;
      for (let i = 0; i < base.length; i += 1) {
        const b = base[i];
        if (b.p.locked || !(b.priceBase > 0)) continue;
        // With per-trade fees, never open a new fee-bearing trade for small change.
        if (settings.feeMode === 'traded' && !tradedAlready.has(b.p.id)) continue;
        if (b.priceBase > remaining + 1e-9) continue;
        const deficit =
          investable * b.p.targetWeight - (b.valueBase + plans[i].tradeValueBase);
        if (deficit <= b.priceBase / 2) continue;
        // `remaining` already caps total spend, so a budget-limited plan simply
        // fills whatever cash the rounding left behind.
        if (deficit > bestDeficit) {
          bestDeficit = deficit;
          bestIndex = i;
        }
      }
      if (bestIndex === -1) break;

      const price = base[bestIndex].priceBase;
      const prev = plans[bestIndex];
      plans[bestIndex] = {
        ...prev,
        tradeShares: prev.tradeShares + 1,
        tradeValueBase: prev.tradeValueBase + price,
        action: prev.tradeShares + 1 > 0 ? 'buy' : prev.tradeShares + 1 < 0 ? 'sell' : 'hold',
      };
      leftoverShares += 1;
      remaining = spendableNow();
      void price;
    }
  }

  // Rounding can also leave the plan *unaffordable*: sells round toward zero,
  // so they raise less than the ideal, while the buys they were meant to fund
  // stay put. Trim the buy that is closest to its target — the one that needs
  // the share least — until the plan fits the cash.
  const incurredFees = () =>
    tradableFees(new Set(base.filter((_b, i) => plans[i].tradeShares !== 0).map((b) => b.p.id)));
  const incurredConversion = () => conversionCostFor(settings, spendOf(plans));

  {
    const remainingNow = () =>
      cash - incurredFees() - incurredConversion().cost - sum(plans.map((pl) => pl.tradeValueBase));
    for (let guard = 0; guard < 10_000 && remainingNow() < -1e-9; guard += 1) {
      let bestIndex = -1;
      let smallestDeficit = Infinity;
      for (let i = 0; i < base.length; i += 1) {
        if (plans[i].tradeShares <= 0 || !(base[i].priceBase > 0)) continue;
        const deficit =
          investable * base[i].p.targetWeight - (base[i].valueBase + plans[i].tradeValueBase);
        if (deficit < smallestDeficit) {
          smallestDeficit = deficit;
          bestIndex = i;
        }
      }
      if (bestIndex === -1) break;

      const price = base[bestIndex].priceBase;
      const prev = plans[bestIndex];
      const shares = prev.tradeShares - 1;
      plans[bestIndex] = {
        ...prev,
        tradeShares: shares,
        tradeValueBase: shares === 0 ? 0 : prev.tradeValueBase - price,
        action: shares > 0 ? 'buy' : shares < 0 ? 'sell' : 'hold',
      };
    }
  }

  // What the chain reserved, versus what the final plan will actually be charged.
  const feesReserved = feesTotal;
  feesTotal = incurredFees();
  const finalConversion = incurredConversion();
  conversionCost = finalConversion.cost;
  converted = finalConversion.converted;
  const finalSpend = spendOf(plans);

  const chargedFee = (p: Position, plan: TradePlan): number =>
    p.locked || plan.tradeShares === 0 ? 0 : p.fee;

  const results: PositionResult[] = base.map((b, i) => {
    const plan = plans[i];
    const rate = fxRate(settings, b.p.currency);
    const targetValue = investable * b.p.targetWeight;
    const newShares = b.p.shares + plan.tradeShares;
    return {
      id: b.p.id,
      ticker: b.p.ticker,
      name: b.p.name,
      currency: b.p.currency,
      priceBase: b.priceBase,
      valueBase: b.valueBase,
      shares: b.p.shares,
      actualWeight: currentTotal > 0 ? b.valueBase / currentTotal : 0,
      targetWeight: b.p.targetWeight,
      driftWeight: (currentTotal > 0 ? b.valueBase / currentTotal : 0) - b.p.targetWeight,
      targetValue,
      deltaValue: targetValue - b.valueBase,
      rawShares: plan.rawShares,
      tradeShares: plan.tradeShares,
      tradeValueBase: plan.tradeValueBase,
      tradeValueLocal: rate > 0 ? plan.tradeValueBase / rate : 0,
      feeApplied: chargedFee(b.p, plan),
      feeAppliedBase: chargedFee(b.p, plan) * rate,
      action: plan.action,
      newShares,
      newValueBase: newShares * b.priceBase,
      newWeight: 0,
      newDrift: 0,
    };
  });

  const newTotal = sum(results.map((r) => r.newValueBase));
  for (const r of results) {
    r.newWeight = newTotal > 0 ? r.newValueBase / newTotal : 0;
    r.newDrift = r.newWeight - r.targetWeight;
  }

  const netTradeValue = sum(results.map((r) => r.tradeValueBase));
  const cashRemaining = cash - netTradeValue - feesTotal - conversionCost;
  const cashRemainingByCurrency = settleBalances(settings, finalSpend, conversionCost);

  if (positions.length > 0 && Math.abs(targetWeightSum - 1) > WEIGHT_SUM_TOLERANCE) {
    warnings.push(
      `Target weights add up to ${(targetWeightSum * 100).toFixed(2)}% instead of 100%. ` +
        `Every target value is scaled by that sum, so results will be off until it is fixed.`,
    );
  }
  if (budgetLimited) {
    const needed = cashToReachTargets(base, currentTotal, feesReserved);
    warnings.push(
      `Reaching the target split exactly would take about ${fmtShort(needed)} ` +
        `${settings.baseCurrency}, more than the ${fmtShort(cash)} you are investing, so every ` +
        `purchase was scaled back proportionally. The split gets closer, but not all the way — ` +
        `add more cash, or allow selling, to close the gap.`,
    );
  }
  if (converted.length > 0 && conversionCost > 1e-6) {
    warnings.push(
      `The plan buys more ${converted.map((c) => c.currency).join(' and ')} than those cash ` +
        `balances hold, so ${fmtShort(conversionCost)} ${settings.baseCurrency} of currency ` +
        `conversion is included. Add cash in those currencies to avoid it.`,
    );
  }
  if (cashRemaining < -1e-6) {
    warnings.push(
      `The plan needs ${fmtShort(-cashRemaining)} ${settings.baseCurrency} more than the ` +
        `available cash. It sells other positions to fund the buys — enable "allow selling" ` +
        `or add cash if that is not intended.`,
    );
  }
  for (const b of base) {
    if (!(b.priceBase > 0) && !b.p.locked) {
      warnings.push(`${b.p.ticker || b.p.name || 'A position'} has no valid unit price, so it cannot be traded.`);
    }
    if (b.p.currency !== settings.baseCurrency && !(settings.fxRates[b.p.currency] > 0)) {
      warnings.push(`No exchange rate for ${b.p.currency}; using 1.00 for ${b.p.ticker || b.p.name}.`);
    }
  }

  return {
    positions: results,
    currentTotal,
    cash,
    feesTotal,
    feesReserved,
    investable,
    cashBalances: { ...(settings.cashBalances ?? {}) },
    fxRatesUsed: Object.fromEntries(
      [
        ...new Set([
          settings.baseCurrency.toUpperCase(),
          ...positions.map((p) => p.currency.toUpperCase()),
          ...Object.keys(settings.cashBalances ?? {}),
        ]),
      ].map((code) => [code, fxRate(settings, code)]),
    ),
    cashRemainingByCurrency,
    conversionCost,
    converted,
    netTradeValue,
    cashRemaining,
    newTotal,
    targetWeightSum,
    leftoverShares,
    budgetLimited,
    cashForFullTarget: budgetLimited
      ? cashToReachTargets(base, currentTotal, feesReserved)
      : cash,
    warnings,
  };
}


/**
 * How much cash a buy-only plan needs to reach every target exactly.
 *
 * Not simply the sum of today's shortfalls: adding cash grows the portfolio,
 * which raises every target value, which widens the shortfalls again. Solving
 * `Σ max(0, (total + budget) × weight − value) = budget` over the underweight
 * set gives `budget = (total × W − V) / (1 − W)`, and since the underweight set
 * itself depends on the budget, that is iterated to a fixed point.
 */
function cashToReachTargets(
  base: { p: Position; priceBase: number; valueBase: number }[],
  currentTotal: number,
  feesTotal: number,
): number {
  let budget = 0;
  for (let pass = 0; pass < 20; pass += 1) {
    // A tolerance matters here: a position sitting exactly on target lands a
    // hair above zero in floating point, which would drag it into the active
    // set and push the weight sum to 1, short-circuiting the solve.
    const active = base.filter(
      (b) => !b.p.locked && (currentTotal + budget) * b.p.targetWeight - b.valueBase > 1e-6,
    );
    const weightSum = sum(active.map((b) => b.p.targetWeight));
    const valueSum = sum(active.map((b) => b.valueBase));
    // Every position underweight: the targets are met at any budget.
    if (weightSum >= 1 - 1e-12) return feesTotal;
    const next = (currentTotal * weightSum - valueSum) / (1 - weightSum);
    if (!Number.isFinite(next) || next < 0) return feesTotal;
    if (Math.abs(next - budget) < 1e-9) {
      budget = next;
      break;
    }
    budget = next;
  }
  return budget + feesTotal;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function fmtShort(v: number): string {
  return v.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


/** Scales all target weights so they sum to exactly 100%. */
export function normalizeWeights(positions: Position[]): Position[] {
  const total = sum(positions.map((p) => p.targetWeight));
  if (!(total > 0)) {
    const even = positions.length > 0 ? 1 / positions.length : 0;
    return positions.map((p) => ({ ...p, targetWeight: even }));
  }
  return positions.map((p) => ({ ...p, targetWeight: p.targetWeight / total }));
}

/** Gives every position the same target weight. */
export function equalizeWeights(positions: Position[]): Position[] {
  const even = positions.length > 0 ? 1 / positions.length : 0;
  return positions.map((p) => ({ ...p, targetWeight: even }));
}
