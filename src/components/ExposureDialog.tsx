import { TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CalcResult, Position } from '../types';
import { formatMoney, formatPercent } from '../lib/format';
import { breakdown, foldTail, profileFor, type Dimension, type ExposureRow } from '../lib/exposure';
import { ChartTooltip, SegmentedControl } from './primitives';

type Basis = 'current' | 'target';

const COUNTRY_LIMIT = 15;
const CURRENCY_LIMIT = 12;

/**
 * Look-through exposure of the positions, by continent, country or currency.
 *
 * One measure per category, so it is a ranked bar list in a single hue: no
 * legend, values in ink beside each bar, and the unclassified remainder set
 * apart in neutral at the bottom.
 */
export function ExposureDialog({
  open,
  onClose,
  positions,
  result,
  baseCurrency,
}: {
  open: boolean;
  onClose: () => void;
  positions: Position[];
  result: CalcResult;
  baseCurrency: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const [dimension, setDimension] = useState<Dimension>('continent');
  const [basis, setBasis] = useState<Basis>(result.currentTotal > 0 ? 'current' : 'target');
  const [hover, setHover] = useState<{ row: ExposureRow; x: number; y: number } | null>(null);
  // The parent passes a fresh onClose on every render. Reading it through a
  // ref keeps the effect below from re-running (and bouncing focus out of the
  // dialog and back) whenever the portfolio changes while the dialog is open.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // Each opening starts fresh: no tooltip left over from last time, and
    // holdings whenever there are any.
    setHover(null);
    setBasis(result.currentTotal > 0 ? 'current' : 'target');
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown, true);
      restoreFocusTo.current?.focus?.();
    };
  }, [open]);

  const amounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of result.positions) {
      out[r.id] = basis === 'current' ? r.valueBase : r.targetValue;
    }
    return out;
  }, [result, basis]);

  const data = useMemo(() => breakdown(positions, amounts, dimension), [positions, amounts, dimension]);

  if (!open) return null;

  const rows =
    dimension === 'country'
      ? foldTail(data.rows, COUNTRY_LIMIT, 'Other countries')
      : dimension === 'currency'
        ? foldTail(data.rows, CURRENCY_LIMIT, 'Other currencies')
        : data.rows;
  const all = data.unclassified ? [...rows, data.unclassified] : rows;
  const maxWeight = Math.max(0.0001, ...all.map((r) => r.weight));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgb(8_12_20/0.55)] p-4 py-8 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-2xl !rounded-[var(--r-xl)]"
        style={{ boxShadow: 'var(--shadow-overlay)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 rounded-t-[var(--r-xl)] border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[1.0625rem] font-semibold tracking-[-0.02em]">
              Exposure
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              What your positions hold underneath, estimated from the index each one tracks.
            </p>
          </div>
          <button ref={closeRef} className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
            <SegmentedControl<Dimension>
              ariaLabel="Group by"
              value={dimension}
              onChange={setDimension}
              options={[
                { value: 'continent', label: 'Continent' },
                { value: 'country', label: 'Country' },
                { value: 'currency', label: 'Currency' },
              ]}
            />
            <SegmentedControl<Basis>
              ariaLabel="Based on"
              value={basis}
              onChange={setBasis}
              options={[
                { value: 'current', label: 'Holdings', hint: 'What you own today' },
                { value: 'target', label: 'Target', hint: 'Your target allocation' },
              ]}
            />
          </div>

          {data.total === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--ink-3)]">
              {basis === 'current'
                ? 'No holdings yet — switch to Target to see your intended allocation.'
                : 'No target weights set yet.'}
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label={`Exposure by ${dimension}`}>
              {all.map((row) => {
                const muted = row.key === 'unclassified';
                return (
                  <li
                    key={row.key}
                    className="grid grid-cols-[minmax(6.5rem,10rem)_1fr_3.5rem] items-center gap-3 rounded-[var(--r-sm)] px-1 py-1 sm:grid-cols-[minmax(7rem,11rem)_1fr_3.5rem_7.5rem]"
                    onMouseMove={(e) => setHover({ row, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHover(null)}
                    style={{ background: hover?.row.key === row.key ? 'var(--surface-2)' : undefined }}
                  >
                    <span
                      className="truncate text-sm"
                      style={{ color: muted ? 'var(--ink-3)' : 'var(--ink-1)' }}
                      title={row.label}
                    >
                      {row.label}
                    </span>
                    <span className="h-3 w-full" aria-hidden>
                      <span
                        className="block h-full rounded-r-[4px]"
                        style={{
                          width: `${Math.max(0.5, (row.weight / maxWeight) * 100)}%`,
                          background: muted ? 'var(--series-other)' : 'var(--series-1)',
                        }}
                      />
                    </span>
                    <span className="num text-right text-sm font-medium text-[var(--ink-1)]">
                      {formatPercent(row.weight, 1)}
                    </span>
                    <span className="num hidden text-right text-xs text-[var(--ink-3)] sm:block">
                      {formatMoney(row.value, baseCurrency, 0)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {data.unclassifiedPositions.length > 0 && (
            <p
              className="rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2 text-xs leading-relaxed text-[var(--ink-2)]"
              style={{ background: 'var(--warning-soft)' }}
            >
              <TriangleAlert size={13} className="mr-1 inline align-[-2px]" aria-hidden />
              <strong>{data.unclassifiedPositions.join(', ')}</strong>{' '}
              {data.unclassifiedPositions.length === 1 ? 'is' : 'are'} not recognised, so{' '}
              {data.unclassifiedPositions.length === 1 ? 'it is' : 'they are'} shown as
              unclassified. Open the position’s details and choose the index it tracks under{' '}
              <em>Exposure</em>.
            </p>
          )}

          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-[var(--ink-2)]">Based on</h3>
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] text-xs">
              {positions.map((p) => {
                const profile = profileFor(p);
                return (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5">
                    <span className="font-medium text-[var(--ink-1)]">{p.ticker || p.name || '—'}</span>
                    <span className="ml-auto text-[var(--ink-3)]">
                      {profile ? profile.label : 'Not recognised'}
                      {profile && profile.id !== p.exposureProfile && ' (auto)'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="text-[0.6875rem] leading-relaxed text-[var(--ink-3)]">
            Country weights are rounded snapshots of each index (2025) — right for the big picture,
            not for decimals. <em>Currency</em> is the currency of the companies held, not the one
            you trade in; a currency-hedged fund counts as its hedge currency.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-3 rounded-b-[var(--r-xl)] border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
          <button className="btn btn-primary !px-4 !py-2" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>

      {hover && (
        <ChartTooltip
          x={hover.x}
          y={hover.y}
          content={
            <div className="space-y-0.5">
              <div className="font-semibold text-[var(--ink-1)]">{hover.row.label}</div>
              <div className="num text-[var(--ink-2)]">
                {formatPercent(hover.row.weight, 2)} · {formatMoney(hover.row.value, baseCurrency)}
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}
