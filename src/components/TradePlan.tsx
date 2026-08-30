import type { CalcResult } from '../types';
import {
  formatMoney,
  formatPercent,
  formatShares,
  formatSignedMoney,
  formatSignedPercent,
} from '../lib/format';
import { Section } from './primitives';

function ActionChip({ action }: { action: 'buy' | 'sell' | 'hold' }) {
  const map = {
    buy: { label: 'Buy', icon: '▲', bg: 'var(--good-soft)', fg: 'var(--good)' },
    sell: { label: 'Sell', icon: '▼', bg: 'var(--critical-soft)', fg: 'var(--critical)' },
    hold: { label: 'Hold', icon: '●', bg: 'var(--surface-2)', fg: 'var(--ink-3)' },
  } as const;
  const s = map[action];
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function TradePlan({
  result,
  currency,
  onExportCsv,
  onBuy,
}: {
  result: CalcResult;
  currency: string;
  onExportCsv: () => void;
  onBuy: () => void;
}) {
  const trades = result.positions.filter((p) => p.tradeShares !== 0);

  return (
    <Section
      title="Trade plan"
      description="What to place with your broker to reach the target allocation."
      actions={
        <>
          <button className="btn" onClick={onBuy} disabled={result.positions.length === 0}>
            Buy shares…
          </button>
          <button className="btn" onClick={onExportCsv} disabled={result.positions.length === 0}>
            ↓ Export CSV
          </button>
        </>
      }
    >
      {result.positions.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--ink-3)]">
          Add positions to generate a plan.
        </div>
      ) : (
        <>
          {trades.length === 0 ? (
            <div className="mx-4 mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--ink-2)] sm:mx-5">
              <strong className="font-semibold text-[var(--ink-1)]">Nothing to trade.</strong> Every
              gap is smaller than one whole share at the current prices — the portfolio is as close
              to target as whole shares allow.
            </div>
          ) : (
            <div className="grid gap-3 px-4 pt-4 sm:px-5 md:grid-cols-2 xl:grid-cols-3">
              {trades.map((p) => (
                <div
                  key={p.id}
                  className="rounded-[var(--r-md)] border p-3.5 transition-shadow hover:shadow-[var(--shadow-raised)]"
                  style={{
                    borderColor: 'var(--border)',
                    background: `linear-gradient(90deg, color-mix(in srgb, ${
                      p.action === 'buy' ? 'var(--good)' : 'var(--critical)'
                    } 7%, var(--surface-1)) 0%, var(--surface-1) 42%)`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-[var(--ink-1)]">
                      {p.ticker || p.name || '—'}
                    </span>
                    <ActionChip action={p.action} />
                  </div>
                  <div className="num mt-1.5 text-2xl font-semibold tracking-tight text-[var(--ink-1)]">
                    {formatShares(Math.abs(p.tradeShares))}
                    <span className="ml-1 text-sm font-normal text-[var(--ink-2)]">
                      share{Math.abs(p.tradeShares) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-2)]">Amount</dt>
                      <dd className="num font-medium text-[var(--ink-1)]">
                        {formatMoney(Math.abs(p.tradeValueBase), currency)}
                      </dd>
                    </div>
                    {p.currency !== currency && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--ink-2)]">In {p.currency}</dt>
                        <dd className="num font-medium text-[var(--ink-1)]">
                          {formatMoney(Math.abs(p.tradeValueLocal), p.currency)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-2)]">Holding after</dt>
                      <dd className="num font-medium text-[var(--ink-1)]">
                        {formatShares(p.newShares)} sh · {formatPercent(p.newWeight)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}

          {/* The full table — the exact numbers behind every card. */}
          <div className="scroll-x mt-4 border-t border-[var(--border)]">
            <table className="w-full min-w-[62rem] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="th th-left">Instrument</th>
                  <th className="th">Value now</th>
                  <th className="th">Target value</th>
                  <th className="th">Gap</th>
                  <th className="th">Ideal shares</th>
                  <th className="th">Action</th>
                  <th className="th">Shares</th>
                  <th className="th">Amount {currency}</th>
                  <th className="th">Fee</th>
                  <th className="th">New shares</th>
                  <th className="th">New weight</th>
                  <th className="th">Drift after</th>
                </tr>
              </thead>
              <tbody>
                {result.positions.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]/70"
                  >
                    <td className="td td-left">
                      <span className="font-medium">{p.ticker || p.name || '—'}</span>
                      {p.ticker && p.name && (
                        <span className="block text-xs text-[var(--ink-3)]">{p.name}</span>
                      )}
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
                    <td className="td num">{formatShares(p.newShares)}</td>
                    <td className="td num">{formatPercent(p.newWeight)}</td>
                    <td
                      className="td num"
                      style={{
                        color:
                          Math.abs(p.newDrift) < 5e-5
                            ? 'var(--ink-3)'
                            : p.newDrift > 0
                              ? 'var(--diverge-pos)'
                              : 'var(--diverge-neg)',
                      }}
                    >
                      {formatSignedPercent(p.newDrift)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--surface-2)] font-semibold">
                  <td className="td td-left">Total</td>
                  <td className="td num">{formatMoney(result.currentTotal)}</td>
                  <td className="td num">{formatMoney(result.investable)}</td>
                  <td className="td" />
                  <td className="td" />
                  <td className="td" />
                  <td className="td" />
                  <td className="td num">{formatSignedMoney(result.netTradeValue)}</td>
                  <td className="td num">{formatMoney(result.feesTotal)}</td>
                  <td className="td" />
                  <td className="td num">{formatMoney(result.newTotal)}</td>
                  <td className="td" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--ink-2)] sm:px-5">
            <span>
              Net traded{' '}
              <strong className="num font-semibold text-[var(--ink-1)]">
                {formatSignedMoney(result.netTradeValue, currency)}
              </strong>
            </span>
            <span>
              Fees{' '}
              <strong className="num font-semibold text-[var(--ink-1)]">
                {formatMoney(result.feesTotal, currency)}
              </strong>
              {Math.abs(result.feesReserved - result.feesTotal) > 1e-9 && (
                <span className="num text-[var(--ink-3)]">
                  {' '}
                  ({formatMoney(result.feesReserved, currency)} reserved)
                </span>
              )}
            </span>
            <span>
              Cash left{' '}
              <strong
                className="num font-semibold"
                style={{
                  color: result.cashRemaining < -1e-6 ? 'var(--critical)' : 'var(--ink-1)',
                }}
              >
                {formatMoney(result.cashRemaining, currency)}
              </strong>
            </span>
          </div>
        </>
      )}
    </Section>
  );
}
