/** Rounding applied to the raw share count of a planned trade. */
export type RoundingMode = 'truncate' | 'floor' | 'nearest';

/** Which per-position fees are subtracted from the investable amount. */
export type FeeMode = 'all' | 'traded';

export type TradeAction = 'buy' | 'sell' | 'hold';

/** A single holding in the portfolio. */
export interface Position {
  id: string;
  /** Short label, e.g. "SWDA". */
  ticker: string;
  /** Full instrument name, e.g. "iShares Core MSCI World". */
  name: string;
  isin?: string;
  /** Currency the unit price is quoted in, e.g. "USD". */
  currency: string;
  /** Price of one share, in `currency`. */
  unitPrice: number;
  /** Number of shares currently held. */
  shares: number;
  /** Desired share of the portfolio, as a fraction (0.30 = 30%). */
  targetWeight: number;
  /** Transaction cost for trading this position, in the base currency. */
  fee: number;
  /** Symbol used when refreshing the price from a quote provider. */
  quoteSymbol?: string;
  /** Excluded positions still count toward the total but are never traded. */
  locked?: boolean;
}

export interface Settings {
  /** Currency every value is reported in, e.g. "CHF". */
  baseCurrency: string;
  /** Fresh money added to the portfolio, in the base currency. */
  cash: number;
  /**
   * Units of base currency per 1 unit of the quoted currency.
   * `{ USD: 0.8505 }` means 1 USD = 0.8505 CHF. The base currency is
   * always 1 and is maintained automatically.
   */
  fxRates: Record<string, number>;
  rounding: RoundingMode;
  /** When false, negative deltas are clamped to zero (buy-only rebalancing). */
  allowSell: boolean;
  feeMode: FeeMode;
  /** Skip share rounding entirely (fractional-share brokers). */
  allowFractionalShares: boolean;
  /**
   * After the main plan, spend what is left of the cash on extra whole shares
   * of whichever position is still furthest below its target. Rounding down
   * leaves money unspent on every position at once; this puts it to work.
   */
  useLeftoverCash: boolean;
}

export interface Portfolio {
  /** Schema version, so stored portfolios can be migrated. */
  version: 1;
  name: string;
  settings: Settings;
  positions: Position[];
}

/** Per-position output of the rebalancing engine. */
export interface PositionResult {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  /** Unit price converted into the base currency. */
  priceBase: number;
  /** Current holding value in the base currency. */
  valueBase: number;
  shares: number;
  actualWeight: number;
  targetWeight: number;
  /** actualWeight − targetWeight. */
  driftWeight: number;
  /** The "Soll": the value this position should have after rebalancing. */
  targetValue: number;
  /** targetValue − valueBase: the amount to move, before share rounding. */
  deltaValue: number;
  /** deltaValue / priceBase: the ideal, unrounded share count. */
  rawShares: number;
  /** The share count actually traded, after rounding and constraints. */
  tradeShares: number;
  /** tradeShares × priceBase; positive = money out, negative = money in. */
  tradeValueBase: number;
  /** The same amount expressed in the position's own currency. */
  tradeValueLocal: number;
  feeApplied: number;
  action: TradeAction;
  newShares: number;
  newValueBase: number;
  newWeight: number;
  /** newWeight − targetWeight: the drift that remains after trading. */
  newDrift: number;
}

/** Full output of the rebalancing engine. */
export interface CalcResult {
  positions: PositionResult[];
  /** Value of all holdings before trading. */
  currentTotal: number;
  cash: number;
  /** Fees the final plan will actually be charged: one per position traded. */
  feesTotal: number;
  /**
   * Fees the target chain set aside before planning. With `feeMode: 'all'` this
   * reserves every position's fee up front, so it can exceed what is finally
   * charged — the difference is simply budgeted headroom that went unused.
   */
  feesReserved: number;
  /** currentTotal + cash − feesReserved: the base for every target value. */
  investable: number;
  /** Net money spent on trades (buys minus sells). */
  netTradeValue: number;
  /** cash − netTradeValue − feesTotal: what is left over uninvested. */
  cashRemaining: number;
  /** Portfolio value after the planned trades. */
  newTotal: number;
  /** Sum of all target weights; should be 1. */
  targetWeightSum: number;
  /** Extra shares the leftover-cash pass added on top of the main plan. */
  leftoverShares: number;
  /**
   * True when buy-only mode could not reach the targets on the available cash,
   * so every purchase was scaled back proportionally.
   */
  budgetLimited: boolean;
  /** In buy-only mode, the cash that would be needed to reach every target exactly. */
  cashForFullTarget: number;
  warnings: string[];
}
