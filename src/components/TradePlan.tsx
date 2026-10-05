import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Download, Printer } from 'lucide-react';
import type { CalcResult, PositionResult } from '../types';
import {
  formatMoney,
  formatPercent,
  formatShares,
  formatSignedMoney,
  formatSignedPercent,
} from '../lib/format';
import { driftColor, driftTone } from '../lib/drift';
import { Section } from './primitives';

const DETAILS_KEY = 'aufteilungsrechner.plan.details';

function ActionChip({ action }: { action: 'buy' | 'sell' | 'hold' }) {
  const map = {
    buy: { label: 'Buy', Icon: ArrowUpRight, bg: 'var(--good-soft)', fg: 'var(--good)' },
    sell: { label: 'Sell', Icon: ArrowDownRight, bg: 'var(--critical-soft)', fg: 'var(--critical)' },
    hold: { label: 'Hold', Icon: null, bg: 'var(--surface-2)', fg: 'var(--ink-3)' },
  } as const;
  const s = map[action];
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }}>
      {s.Icon && <s.Icon size={12} strokeWidth={2.5} aria-hidden />}
      {s.label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'critical';
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 bg-[var(--surface-1)] px-4 py-3 sm:px-5">
      <div className="eyebrow">{label}</div>
      <div
        className={`num mt-1 font-semibold leading-tight tracking-[-0.02em] ${
          emphasis ? 'text-[1.375rem]' : 'text-[1.125rem]'
        }`}
        style={{ color: tone === 'critical' ? 'var(--critical)' : 'var(--ink-1)' }}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-[var(--ink-3)]">{hint}</div>}
    </div>
  );
}

/** With one balance the total says it all; with several, show the mix. */
function cashHint(result: CalcResult, currency: string): string {
  const entries = Object.entries(result.cashBalances).filter(([, v]) => v > 0);
  if (entries.length === 0) return 'Add cash below';
  if (entries.length === 1 && entries[0][0] === currency) return 'Ready to invest';
  return entries
    .sort(([a], [b]) => (a === currency ? -1 : b === currency ? 1 : a.localeCompare(b)))
    .map(([code, amount]) => formatMoney(amount, code, 0))
    .join(' + ');
}

function countLabel(trades: PositionResult[]): string {
  const buys = trades.filter((t) => t.action === 'buy').length;
  const sells = trades.filter((t) => t.action === 'sell').length;
  const parts = [];
  if (buys) parts.push(`${buys} buy${buys === 1 ? '' : 's'}`);
  if (sells) parts.push(`${sells} sell${sells === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'No trades';
}

function loadDetailsOpen(): boolean {
  try {
    return localStorage.getItem(DETAILS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The answer, first: what to place with the broker, and what it costs. The
 * exact numbers behind each order sit in a collapsed "calculation" section.
 */
export function TradePlan({
  result,
  currency,
  tolerance,
  notices,
  onExportCsv,
}: {
  result: CalcResult;
  currency: string;
  tolerance: number;
  /** Warnings about the plan, rendered between the figures and the orders. */
  notices?: React.ReactNode;
  onExportCsv: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(loadDetailsOpen);
  const trades = result.positions.filter((p) => p.tradeShares !== 0);
  const overspent = result.cashRemaining < -1e-6;

  // The same currency list the Cash to invest section shows — base, every
  // position currency, and anything still holding a balance — so a currency
  // never appears in one table and not the other.
  const cashRows = [
    ...new Set([
      ...Object.keys(result.fxRatesUsed),
      ...Object.keys(result.cashBalances),
      ...Object.keys(result.cashRemainingByCurrency),
    ]),
  ]
    .sort((a, b) => (a === currency ? -1 : b === currency ? 1 : a.localeCompare(b)))
    .map((code) => {
      const before = result.cashBalances[code] ?? 0;
      const left = result.cashRemainingByCurrency[code] ?? 0;
      const rate = result.fxRatesUsed[code] ?? 1;
      return { code, before, used: Math.max(0, before - left), left, leftBase: left * rate };
    });

  return (
    <Section
      title="Your plan"
      description="What to place with your broker. It updates as you edit the positions, cash and settings below."
      actions={
        <>
          <button
            className="btn"
            onClick={() => window.print()}
            disabled={trades.length === 0}
            title="Print the plan to take to your broker"
          >
            <Printer size={15} aria-hidden /> Print
          </button>
          <button className="btn" onClick={onExportCsv} disabled={result.positions.length === 0}>
            <Download size={15} aria-hidden /> Export CSV
          </button>
        </>
      }
    >
      {result.positions.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--ink-3)]">
          Add positions below to generate a plan.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border-b border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
            <Stat
              label="Cash to invest"
              value={formatMoney(result.cash, currency)}
              hint={cashHint(result, currency)}
            />
            <Stat
              label="Net traded"
              value={formatSignedMoney(result.netTradeValue, currency)}
              hint={countLabel(trades)}
            />
            <Stat
              label="Fees"
              value={formatMoney(result.feesTotal, currency)}
              hint={
                result.conversionCost > 1e-6
                  ? `+ ${formatMoney(result.conversionCost, currency)} conversion`
                  : Math.abs(result.feesReserved - result.feesTotal) > 1e-9
                    ? `${formatMoney(result.feesReserved, currency)} reserved`
                    : 'On the trades planned'
              }
            />
            <Stat
              label="Left over"
              value={formatMoney(result.cashRemaining, currency)}
              hint={overspent ? 'Plan exceeds the cash available' : 'Stays as cash'}
              tone={overspent ? 'critical' : 'default'}
              emphasis
            />
          </div>

          {notices}

          {trades.length === 0 ? (
            <div className="mx-4 my-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--ink-2)] sm:mx-5">
              <strong className="font-semibold text-[var(--ink-1)]">Nothing to trade.</strong> Every
              gap is smaller than one whole share at the current prices — the portfolio is as close
              to target as whole shares allow.
            </div>
          ) : (
            <ul className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-3" aria-label="Orders">
              {trades.map((p) => (
                <li
                  key={p.id}
                  className="rounded-[var(--r-md)] border p-3.5"
                  style={{
                    borderColor: 'var(--border)',
                    background: `linear-gradient(90deg, color-mix(in srgb, ${
                      p.action === 'buy' ? 'var(--good)' : 'var(--critical)'
                    } 7%, var(--surface-1)) 0%, var(--surface-1) 42%)`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <ActionChip action={p.action} />
                    <span className="num text-xs text-[var(--ink-3)]">
                      {formatShares(p.shares)} → {formatShares(p.newShares)} sh
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="num text-2xl font-semibold tracking-tight text-[var(--ink-1)]">
                      {formatShares(Math.abs(p.tradeShares))}
                    </span>
                    <span className="truncate text-base font-semibold text-[var(--ink-1)]">
                      {p.ticker || p.name || '—'}
                    </span>
                  </div>
                  {p.ticker && p.name && (
                    <div className="truncate text-xs text-[var(--ink-3)]">{p.name}</div>
                  )}
                  <dl className="mt-2.5 space-y-1 border-t border-[var(--border)] pt-2.5 text-xs">
                    {p.currency !== currency && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--ink-2)]">Order value</dt>
                        <dd className="num font-semibold text-[var(--ink-1)]">
                          {formatMoney(Math.abs(p.tradeValueLocal), p.currency)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-2)]">
                        {p.currency !== currency ? `In ${currency}` : 'Order value'}
                      </dt>
                      <dd
                        className={`num ${
                          p.currency !== currency
                            ? 'text-[var(--ink-2)]'
                            : 'font-semibold text-[var(--ink-1)]'
                        }`}
                      >
                        {formatMoney(Math.abs(p.tradeValueBase), currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-2)]">Weight</dt>
                      <dd className="num text-[var(--ink-2)]">
                        {formatPercent(p.actualWeight)} → {formatPercent(p.newWeight)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}

          <details
            className="group border-t border-[var(--border)]"
            open={detailsOpen}
            onToggle={(e) => {
              const open = (e.currentTarget as HTMLDetailsElement).open;
              setDetailsOpen(open);
              try {
                localStorage.setItem(DETAILS_KEY, open ? '1' : '0');
              } catch {
                /* ignore */
              }
            }}
          >
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-xs font-semibold text-[var(--ink-2)] hover:text-[var(--ink-1)] sm:px-5 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                size={14}
                className="transition-transform group-open:rotate-90"
                aria-hidden
              />
              {detailsOpen ? 'Hide the calculation' : 'Show the calculation'}
              <span className="font-normal text-[var(--ink-3)] max-sm:hidden">
                — target values, ideal share counts and cash left per currency
              </span>
            </summary>

            <div className="scroll-x border-t border-[var(--border)]">
              <table className="w-full min-w-[60rem] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="th th-left sticky-col">Instrument</th>
                    <th className="th">Value now</th>
                    <th className="th">Target value</th>
                    <th className="th">Gap</th>
                    <th className="th">Ideal shares</th>
                    <th className="th">Action</th>
                    <th className="th">Shares</th>
                    <th className="th">Amount {currency}</th>
                    <th className="th">Fee</th>
                    <th className="th">New weight</th>
                    <th className="th">Drift after</th>
                  </tr>
                </thead>
                <tbody>
                  {result.positions.map((p) => {
                    const tone = driftTone(p.newDrift, tolerance);
                    return (
                      <tr key={p.id} className="border-b border-[var(--border)]">
                        <td className="td td-left sticky-col">
                          <span className="font-medium">{p.ticker || p.name || '—'}</span>
                        </td>
                        <td className="td num">{formatMoney(p.valueBase)}</td>
                        <td className="td num text-[var(--ink-2)]">{formatMoney(p.targetValue)}</td>
                        <td className="td num">{formatSignedMoney(p.deltaValue)}</td>
                        <td className="td num text-[var(--ink-3)]">{p.rawShares.toFixed(3)}</td>
                        <td className="td">
                          <ActionChip action={p.action} />
                        </td>
                        <td className="td num font-semibold">
                          {p.tradeShares === 0 ? '—' : formatShares(p.tradeShares)}
                        </td>
                        <td className="td num">
                          {p.tradeShares === 0 ? '—' : formatSignedMoney(p.tradeValueBase)}
                        </td>
                        <td className="td num text-[var(--ink-3)]">
                          {p.feeApplied === 0 ? '—' : `${formatMoney(p.feeApplied)} ${p.currency}`}
                        </td>
                        <td className="td num">{formatPercent(p.newWeight)}</td>
                        <td className="td num" style={{ color: driftColor(tone) }}>
                          {tone === 'ok' ? 'on target' : formatSignedPercent(p.newDrift)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--surface-2)] font-semibold">
                    <td className="td td-left sticky-col">Total</td>
                    <td className="td num">{formatMoney(result.currentTotal)}</td>
                    <td className="td num">{formatMoney(result.investable)}</td>
                    <td className="td" colSpan={4} />
                    <td className="td num">{formatSignedMoney(result.netTradeValue)}</td>
                    <td className="td num">{formatMoney(result.feesTotal)}</td>
                    <td className="td" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
              <h3 className="text-sm font-semibold">Cash left after the plan</h3>
              <div className="scroll-x mt-2">
                <table className="w-full min-w-[30rem] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="th th-left sticky-col w-[7rem]">Currency</th>
                      <th className="th">Before</th>
                      <th className="th">Used</th>
                      <th className="th">Left</th>
                      <th className="th">Left in {currency}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashRows.map((row) => (
                      <tr key={row.code} className="border-b border-[var(--border)]">
                        <td className="td td-left sticky-col">
                          <span className="num font-semibold">{row.code}</span>
                        </td>
                        <td className="td num text-[var(--ink-2)]">{formatMoney(row.before)}</td>
                        <td className="td num">
                          {row.used > 1e-9 ? `−${formatMoney(row.used)}` : '—'}
                        </td>
                        <td
                          className="td num font-semibold"
                          style={{ color: row.left <= 1e-9 ? 'var(--ink-3)' : undefined }}
                        >
                          {formatMoney(row.left)}
                        </td>
                        <td className="td num text-[var(--ink-2)]">{formatMoney(row.leftBase)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--surface-2)] font-semibold">
                      <td className="td td-left sticky-col">Total</td>
                      <td className="td" colSpan={3} />
                      <td className="td num">
                        {formatMoney(cashRows.reduce((a, r) => a + r.leftBase, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-3)]">
                Portfolio value{' '}
                <span className="num font-medium text-[var(--ink-2)]">
                  {formatMoney(result.currentTotal, currency)} →{' '}
                  {formatMoney(result.newTotal, currency)}
                </span>
                {result.conversionCost > 1e-6 && (
                  <>
                    {' '}
                    · includes {formatMoney(result.conversionCost, currency)} of currency
                    conversion
                  </>
                )}
                .
              </p>
            </div>
          </details>
        </>
      )}
    </Section>
  );
}
