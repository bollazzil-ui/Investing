import type { CalcResult, Settings } from '../../types';
import { formatMoney, formatPercent, formatShares } from '../../lib/format';
import { seriesColor } from '../../lib/colors';
import { Toggle } from '../primitives';
import { StepNav } from './Stepper';

export function StepResult({
  result,
  settings,
  onSettings,
  onBack,
  onExportCsv,
  onAdvanced,
}: {
  result: CalcResult;
  settings: Settings;
  onSettings: (next: Settings) => void;
  onBack: () => void;
  onExportCsv: () => void;
  onAdvanced: () => void;
}) {
  const base = settings.baseCurrency;
  const buys = result.positions.filter((p) => p.tradeShares > 0);
  const sells = result.positions.filter((p) => p.tradeShares < 0);
  const spent = buys.reduce((a, p) => a + p.tradeValueBase, 0);
  const raised = -sells.reduce((a, p) => a + p.tradeValueBase, 0);
  const index = (id: string) => result.positions.findIndex((p) => p.id === id);

  return (
    <div className="card">
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {buys.length === 0 && sells.length === 0
            ? 'Nothing to buy right now'
            : `Buy ${buys.length === 1 ? 'this' : `these ${buys.length}`}`}
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          {buys.length === 0 && sells.length === 0
            ? 'Your money does not stretch to a whole share of anything that is currently below target. Add more cash, or switch on fractional shares in the advanced view.'
            : `Placing these orders puts ${formatMoney(spent, base)} of your ${formatMoney(
                result.cash,
                base,
              )} to work${
                result.budgetLimited
                  ? ' and moves the portfolio as close to your target split as that money allows.'
                  : ' and lands the portfolio on your target split.'
              }`}
        </p>

        {result.warnings.length > 0 && (
          <div
            className="mt-5 rounded-xl border-l-4 px-4 py-3 text-sm"
            style={{ borderLeftColor: 'var(--warning)', background: 'var(--warning-soft)' }}
          >
            <ul className="space-y-1.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            {result.budgetLimited && (
              <div className="no-print mt-3 flex flex-wrap gap-2">
                <button
                  className="btn"
                  onClick={() =>
                    onSettings({ ...settings, cash: Math.ceil(result.cashForFullTarget) })
                  }
                >
                  Invest {formatMoney(Math.ceil(result.cashForFullTarget), base, 0)} instead
                </button>
                <button
                  className="btn"
                  onClick={() => onSettings({ ...settings, allowSell: true })}
                >
                  Allow selling to close the gap
                </button>
              </div>
            )}
          </div>
        )}

        {buys.length > 0 && (
          <ol className="mt-6 space-y-3">
            {buys.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 p-4"
                style={{ borderColor: 'var(--good)', background: 'var(--good-soft)' }}
              >
                <span
                  className="h-12 w-1.5 shrink-0 rounded-full"
                  style={{ background: seriesColor(index(p.id)) }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="num text-3xl font-bold tracking-tight">
                      {formatShares(p.tradeShares)}
                    </span>
                    <span className="text-sm text-[var(--ink-2)]">
                      share{p.tradeShares === 1 ? '' : 's'} of
                    </span>
                    <span className="text-xl font-semibold">{p.ticker}</span>
                  </div>
                  <p className="truncate text-xs text-[var(--ink-3)]">{p.name}</p>
                </div>
                <div className="basis-full sm:basis-auto sm:text-right">
                  <div className="num text-lg font-semibold">
                    {formatMoney(p.tradeValueBase, base)}
                  </div>
                  <div className="num text-xs text-[var(--ink-3)]">
                    {p.currency !== base && `${formatMoney(p.tradeValueLocal, p.currency)} · `}
                    {formatMoney(p.priceBase, base)} each
                  </div>
                </div>
                <div className="basis-full border-t border-[var(--border)] pt-2 text-xs text-[var(--ink-2)] sm:basis-auto sm:border-0 sm:pt-0 sm:pl-4">
                  <div className="num">
                    {formatShares(p.shares)} → <strong>{formatShares(p.newShares)}</strong> shares
                  </div>
                  <div className="num">
                    {formatPercent(p.actualWeight, 1)} → <strong>{formatPercent(p.newWeight, 1)}</strong>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        {sells.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold">
              And sell {sells.length === 1 ? 'this' : `these ${sells.length}`}
              <span className="ml-2 font-normal text-[var(--ink-3)]">
                raising {formatMoney(raised, base)}
              </span>
            </h3>
            <ol className="mt-3 space-y-3">
              {sells.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 p-4"
                  style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)' }}
                >
                  <span
                    className="h-12 w-1.5 shrink-0 rounded-full"
                    style={{ background: seriesColor(index(p.id)) }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="num text-3xl font-bold tracking-tight">
                        {formatShares(Math.abs(p.tradeShares))}
                      </span>
                      <span className="text-sm text-[var(--ink-2)]">
                        share{Math.abs(p.tradeShares) === 1 ? '' : 's'} of
                      </span>
                      <span className="text-xl font-semibold">{p.ticker}</span>
                    </div>
                    <p className="truncate text-xs text-[var(--ink-3)]">{p.name}</p>
                  </div>
                  <div className="num basis-full text-lg font-semibold sm:basis-auto sm:text-right">
                    {formatMoney(Math.abs(p.tradeValueBase), base)}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        {/* Where the money went. */}
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
          {[
            { k: 'You are investing', v: formatMoney(result.cash, base) },
            { k: 'Spent on shares', v: formatMoney(spent - raised, base) },
            { k: 'Trading fees', v: formatMoney(result.feesTotal, base) },
            {
              k: 'Left in cash',
              v: formatMoney(result.cashRemaining, base),
              warn: result.cashRemaining < -1e-6,
            },
          ].map((cell) => (
            <div key={cell.k} className="bg-[var(--surface-1)] px-3 py-2.5">
              <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)]">
                {cell.k}
              </dt>
              <dd
                className="num mt-0.5 font-semibold"
                style={{ color: cell.warn ? 'var(--critical)' : undefined }}
              >
                {cell.v}
              </dd>
            </div>
          ))}
        </dl>

        {result.leftoverShares > 0 && (
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            Includes {result.leftoverShares} extra share{result.leftoverShares === 1 ? '' : 's'}{' '}
            bought with what rounding left over.
          </p>
        )}

        <div className="mt-5 rounded-xl border border-[var(--border)] p-4">
          <Toggle
            checked={settings.useLeftoverCash}
            onChange={(useLeftoverCash) => onSettings({ ...settings, useLeftoverCash })}
            label="Use up the leftover cash"
            hint="After the main plan, buy extra whole shares of whatever is still furthest below target."
          />
        </div>

        {/* Where the portfolio lands. */}
        <h3 className="mt-6 text-sm font-semibold">Your split afterwards</h3>
        <div className="mt-2 space-y-1.5">
          {result.positions.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="w-16 shrink-0 truncate text-xs font-medium text-[var(--ink-2)]">
                {p.ticker}
              </span>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-[var(--surface-2)]">
                <span
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${Math.max(0, p.newWeight) * 100}%`, background: seriesColor(i) }}
                  aria-hidden
                />
                <span
                  className="absolute inset-y-0 w-0.5"
                  style={{
                    left: `${Math.max(0, p.targetWeight) * 100}%`,
                    background: 'var(--ink-1)',
                  }}
                  title={`Target ${formatPercent(p.targetWeight, 1)}`}
                  aria-hidden
                />
              </div>
              <span className="num w-32 shrink-0 text-right text-xs text-[var(--ink-2)]">
                {formatPercent(p.newWeight, 1)}
                <span className="text-[var(--ink-3)]"> of {formatPercent(p.targetWeight, 1)}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[0.6875rem] text-[var(--ink-3)]">
          The dark tick marks your target.
        </p>

      </div>

      <StepNav onBack={onBack} backLabel="Change the split">
        <button className="btn" onClick={onExportCsv}>
          ↓ Export CSV
        </button>
        <button className="btn" onClick={() => window.print()}>
          🖨 Print
        </button>
        <button className="btn btn-ghost" onClick={onAdvanced}>
          Open advanced view
        </button>
      </StepNav>
    </div>
  );
}
