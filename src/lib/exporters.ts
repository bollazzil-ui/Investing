import type { CalcResult, Portfolio } from '../types';

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRows(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(';')).join('\n');
}

/** The trade plan as a semicolon-separated CSV, which Excel opens directly. */
export function tradePlanCsv(portfolio: Portfolio, result: CalcResult): string {
  const base = portfolio.settings.baseCurrency;
  const rows: (string | number)[][] = [
    [
      'Ticker',
      'Name',
      'Currency',
      `Unit price (currency)`,
      `Unit price (${base})`,
      'Shares held',
      `Value (${base})`,
      'Actual %',
      'Target %',
      'Drift %',
      `Target value (${base})`,
      `Delta (${base})`,
      'Ideal shares',
      'Action',
      'Trade shares',
      `Trade amount (${base})`,
      'Trade amount (currency)',
      `Fee (${base})`,
      'New shares',
      `New value (${base})`,
      'New %',
    ],
  ];
  for (const p of result.positions) {
    const pos = portfolio.positions.find((x) => x.id === p.id);
    rows.push([
      p.ticker,
      p.name,
      p.currency,
      n(pos?.unitPrice ?? 0, 4),
      n(p.priceBase, 4),
      n(p.shares, 4),
      n(p.valueBase),
      pct(p.actualWeight),
      pct(p.targetWeight),
      pct(p.driftWeight),
      n(p.targetValue),
      n(p.deltaValue),
      n(p.rawShares, 4),
      p.action,
      n(p.tradeShares, 4),
      n(p.tradeValueBase),
      n(p.tradeValueLocal),
      n(p.feeApplied),
      n(p.newShares, 4),
      n(p.newValueBase),
      pct(p.newWeight),
    ]);
  }
  rows.push([]);
  rows.push(['Current total', n(result.currentTotal)]);
  rows.push(['Cash to invest', n(result.cash)]);
  rows.push(['Fees charged', n(result.feesTotal)]);
  rows.push(['Fees reserved', n(result.feesReserved)]);
  rows.push(['Investable total', n(result.investable)]);
  rows.push(['Net traded', n(result.netTradeValue)]);
  rows.push(['Cash remaining', n(result.cashRemaining)]);
  rows.push(['New total', n(result.newTotal)]);
  return csvRows(rows);
}

function n(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : '';
}

function pct(fraction: number): string {
  return Number.isFinite(fraction) ? (fraction * 100).toFixed(4) : '';
}

export function portfolioJson(portfolio: Portfolio): string {
  return JSON.stringify(portfolio, null, 2);
}

export function timestampedName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}.${ext}`;
}
