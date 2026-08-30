import { Fragment, useState } from 'react';
import type { CalcResult, Portfolio, Position } from '../types';
import { formatMoney, formatPercent, formatSignedPercent, uid } from '../lib/format';
import { equalizeWeights, normalizeWeights } from '../lib/calc';
import { seriesColor, isFoldedColor } from '../lib/colors';
import { NumberField, Section, TextField } from './primitives';
import { AddProductDialog } from './AddProductDialog';

export function PositionsTable({
  portfolio,
  result,
  onChange,
  onRefreshQuote,
  quoteStatus,
}: {
  portfolio: Portfolio;
  result: CalcResult;
  onChange: (positions: Position[]) => void;
  onRefreshQuote: (id: string) => void;
  quoteStatus: Record<string, 'loading' | 'ok' | { error: string } | undefined>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { positions, settings } = portfolio;
  const base = settings.baseCurrency;
  const weightSum = result.targetWeightSum;
  const weightsOk = Math.abs(weightSum - 1) < 1e-6;

  function update(id: string, patch: Partial<Position>) {
    onChange(positions.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPosition(position: Position) {
    onChange([...positions, position]);
    setExpanded(position.id);
  }

  function duplicate(p: Position) {
    const copy: Position = { ...p, id: uid(), ticker: `${p.ticker} copy`.trim(), targetWeight: 0 };
    const at = positions.findIndex((x) => x.id === p.id);
    onChange([...positions.slice(0, at + 1), copy, ...positions.slice(at + 1)]);
  }

  function remove(id: string) {
    onChange(positions.filter((p) => p.id !== id));
  }

  function move(id: string, delta: number) {
    const at = positions.findIndex((p) => p.id === id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= positions.length) return;
    const next = [...positions];
    const [item] = next.splice(at, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <Section
      title="Positions"
      description="Value is derived from shares × unit price × exchange rate, so it always matches reality."
      actions={
        <>
          <button className="btn" onClick={() => onChange(equalizeWeights(positions))} disabled={positions.length === 0}>
            Equal weights
          </button>
          <button
            className={weightsOk ? 'btn' : 'btn btn-primary'}
            onClick={() => onChange(normalizeWeights(positions))}
            disabled={positions.length === 0}
            title="Scale every target so they add up to 100%"
          >
            Normalise to 100%
          </button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add position
          </button>
        </>
      }
    >
      <div className="scroll-x">
        <table className="w-full min-w-[64rem] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="th th-left w-[15rem]">Instrument</th>
              <th className="th w-[6rem]">Currency</th>
              <th className="th w-[8rem]">Unit price</th>
              <th className="th w-[7.5rem]">Shares</th>
              <th className="th w-[9rem]">Value {base}</th>
              <th className="th w-[6.5rem]">Actual</th>
              <th className="th w-[7.5rem]">Target</th>
              <th className="th w-[6.5rem]">Drift</th>
              <th className="th w-[6.5rem]">Fee {base}</th>
              <th className="th w-[7rem]" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const r = result.positions.find((x) => x.id === p.id);
              const status = quoteStatus[p.id];
              const open = expanded === p.id;
              return (
                <Fragment key={p.id}>
                  <tr
                    className="border-b border-[var(--border)] align-middle transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="td td-left">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-6 w-1 shrink-0 rounded-full"
                          style={{ background: seriesColor(i) }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <TextField
                            value={p.ticker}
                            onChange={(v) => update(p.id, { ticker: v })}
                            placeholder="Ticker"
                            ariaLabel={`Ticker for position ${i + 1}`}
                            className="font-semibold"
                          />
                          <button
                            className="btn btn-ghost mt-1 block w-full max-w-full !justify-start overflow-hidden !px-1 !py-0 text-left text-xs"
                            onClick={() => setExpanded(open ? null : p.id)}
                            aria-expanded={open}
                            title={p.name || 'Add name, ISIN, quote symbol'}
                          >
                            <span className="truncate">
                              {open ? '▾' : '▸'} {p.name || 'Add name, ISIN, quote symbol'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <TextField
                        value={p.currency}
                        onChange={(v) => update(p.id, { currency: v.toUpperCase().slice(0, 5) })}
                        ariaLabel={`Currency for ${p.ticker || `position ${i + 1}`}`}
                        className="text-center uppercase"
                      />
                    </td>
                    <td className="td">
                      <NumberField
                        value={p.unitPrice}
                        onChange={(v) => update(p.id, { unitPrice: v })}
                        min={0}
                        ariaLabel={`Unit price for ${p.ticker || `position ${i + 1}`}`}
                      />
                      {r && p.currency !== base && (
                        <div className="num mt-0.5 text-[0.6875rem] text-[var(--ink-3)]">
                          = {formatMoney(r.priceBase, base, 4)}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      <NumberField
                        value={p.shares}
                        onChange={(v) => update(p.id, { shares: v })}
                        ariaLabel={`Shares held of ${p.ticker || `position ${i + 1}`}`}
                      />
                    </td>
                    <td className="td num font-medium">{r ? formatMoney(r.valueBase, undefined) : '—'}</td>
                    <td className="td num text-[var(--ink-2)]">{r ? formatPercent(r.actualWeight) : '—'}</td>
                    <td className="td">
                      <NumberField
                        value={p.targetWeight * 100}
                        onChange={(v) => update(p.id, { targetWeight: v / 100 })}
                        suffix="%"
                        min={0}
                        max={100}
                        ariaLabel={`Target weight for ${p.ticker || `position ${i + 1}`}`}
                      />
                    </td>
                    <td
                      className="td num font-medium"
                      style={{
                        color: !r
                          ? undefined
                          : Math.abs(r.driftWeight) < 5e-5
                            ? 'var(--ink-3)'
                            : r.driftWeight > 0
                              ? 'var(--diverge-pos)'
                              : 'var(--diverge-neg)',
                      }}
                    >
                      {r ? formatSignedPercent(r.driftWeight) : '—'}
                    </td>
                    <td className="td">
                      <NumberField
                        value={p.fee}
                        onChange={(v) => update(p.id, { fee: v })}
                        min={0}
                        ariaLabel={`Fee for ${p.ticker || `position ${i + 1}`}`}
                      />
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          className="btn btn-ghost !px-1.5"
                          onClick={() => move(p.id, -1)}
                          disabled={i === 0}
                          title="Move up"
                          aria-label={`Move ${p.ticker || `position ${i + 1}`} up`}
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-ghost !px-1.5"
                          onClick={() => move(p.id, 1)}
                          disabled={i === positions.length - 1}
                          title="Move down"
                          aria-label={`Move ${p.ticker || `position ${i + 1}`} down`}
                        >
                          ↓
                        </button>
                        <button
                          className="btn btn-ghost !px-1.5"
                          onClick={() => duplicate(p)}
                          title="Duplicate"
                          aria-label={`Duplicate ${p.ticker || `position ${i + 1}`}`}
                        >
                          ⧉
                        </button>
                        <button
                          className="btn btn-ghost btn-danger !px-1.5"
                          onClick={() => remove(p.id)}
                          title="Remove"
                          aria-label={`Remove ${p.ticker || `position ${i + 1}`}`}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                      <td colSpan={10} className="px-4 py-3">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <label className="label">Full name</label>
                            <TextField
                              value={p.name}
                              onChange={(v) => update(p.id, { name: v })}
                              placeholder="iShares Core MSCI World"
                            />
                          </div>
                          <div>
                            <label className="label">ISIN</label>
                            <TextField
                              value={p.isin ?? ''}
                              onChange={(v) => update(p.id, { isin: v })}
                              placeholder="IE00B4L5Y983"
                            />
                          </div>
                          <div>
                            <label className="label">Quote symbol (Stooq)</label>
                            <div className="flex gap-2">
                              <TextField
                                value={p.quoteSymbol ?? ''}
                                onChange={(v) => update(p.id, { quoteSymbol: v })}
                                placeholder="swda.uk"
                              />
                              <button
                                className="btn"
                                onClick={() => onRefreshQuote(p.id)}
                                disabled={!p.quoteSymbol || status === 'loading'}
                              >
                                {status === 'loading' ? '…' : 'Fetch'}
                              </button>
                            </div>
                            {status && status !== 'loading' && (
                              <p
                                className="mt-1 text-[0.6875rem]"
                                style={{
                                  color: status === 'ok' ? 'var(--good)' : 'var(--critical)',
                                }}
                              >
                                {status === 'ok' ? '✓ Price updated' : `✕ ${status.error}`}
                              </p>
                            )}
                          </div>
                          <div className="flex items-end">
                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={Boolean(p.locked)}
                                onChange={(e) => update(p.id, { locked: e.target.checked })}
                                className="h-4 w-4 accent-[var(--accent)]"
                              />
                              <span>
                                <span className="font-medium">Hold — never trade</span>
                                <span className="block text-xs text-[var(--ink-3)]">
                                  Counts toward the total, but no buy or sell is planned.
                                </span>
                              </span>
                            </label>
                          </div>
                        </div>
                        {isFoldedColor(i) && (
                          <p className="mt-2 text-[0.6875rem] text-[var(--ink-3)]">
                            Beyond eight positions the chart colours fold into one neutral shade —
                            the table stays exact.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {positions.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center">
                  <p className="text-sm text-[var(--ink-2)]">No positions yet.</p>
                  <button className="btn btn-primary mt-3" onClick={() => setAdding(true)}>
                    + Add your first position
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {positions.length > 0 && (
            <tfoot>
              <tr className="bg-[var(--surface-2)]">
                <td className="td td-left font-semibold">Total</td>
                <td className="td" />
                <td className="td" />
                <td className="td" />
                <td className="td num font-semibold">{formatMoney(result.currentTotal)}</td>
                <td className="td num font-semibold">{formatPercent(result.currentTotal > 0 ? 1 : 0)}</td>
                <td className="td num font-semibold" style={{ color: weightsOk ? undefined : 'var(--critical)' }}>
                  {formatPercent(weightSum)}
                </td>
                <td className="td" />
                <td className="td num font-semibold">{formatMoney(result.feesTotal)}</td>
                <td className="td" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <AddProductDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={addPosition}
        baseCurrency={base}
        defaultFee={positions.length > 0 ? positions[positions.length - 1].fee : 0}
        suggestedWeight={Math.max(0, 1 - weightSum)}
      />
    </Section>
  );
}
