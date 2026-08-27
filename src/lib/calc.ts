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
  const cash = Number.isFinite(settings.cash) ? settings.cash : 0;

  const tradableFees = (ids: Set<string> | null) =>
    sum(
      positions
        .filter((p) => !p.locked && (ids === null || ids.has(p.id)))
        .map((p) => (Number.isFinite(p.fee) ? p.fee : 0)),
    );

  // Fixed point over the fee/trade dependency (a no-op when feeMode is 'all').
  let feesTotal = tradableFees(null);
  let plans: TradePlan[] = [];
  let investable = 0;
  for (let pass = 0; pass < 8; pass += 1) {
    investable = currentTotal + cash - feesTotal;
    plans = base.map((b) =>
      planTrade(investable * b.p.targetWeight - b.valueBase, b.priceBase, {
        rounding: settings.rounding,
        allowSell: settings.allowSell,
        allowFractionalShares: settings.allowFractionalShares,
        locked: b.p.locked,
      }),
    );
    if (settings.feeMode !== 'traded') break;
    const tradedIds = new Set(
      base.filter((_b, i) => plans[i].tradeShares !== 0).map((b) => b.p.id),
    );
    const nextFees = tradableFees(tradedIds);
    if (Math.abs(nextFees - feesTotal) < 1e-9) break;
    feesTotal = nextFees;
  }

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
      feeApplied:
        b.p.locked || (settings.feeMode === 'traded' && plan.tradeShares === 0)
          ? 0
          : b.p.fee,
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
  const cashRemaining = cash - netTradeValue - feesTotal;

  if (positions.length > 0 && Math.abs(targetWeightSum - 1) > WEIGHT_SUM_TOLERANCE) {
    warnings.push(
      `Target weights add up to ${(targetWeightSum * 100).toFixed(2)}% instead of 100%. ` +
        `Every target value is scaled by that sum, so results will be off until it is fixed.`,
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
    investable,
    netTradeValue,
    cashRemaining,
    newTotal,
    targetWeightSum,
    warnings,
  };
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
