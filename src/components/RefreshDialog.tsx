import { useEffect, useId, useRef } from 'react';
import type { RefreshItem, RefreshReport } from '../lib/refresh';
import { formatMoney } from '../lib/format';

/**
 * The result of a "Refresh prices" run.
 *
 * Opens whenever something did not update, and names each currency or product
 * with the reason, so the user knows exactly which field to fill in by hand.
 */
export function RefreshDialog({
  report,
  baseCurrency,
  onClose,
}: {
  report: RefreshReport | null;
  baseCurrency: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const open = report !== null;

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open) return;
    restoreFocusTo.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
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
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!report) return null;

  const problems = [...report.fx, ...report.prices].filter(
    (i) => i.status === 'failed' || i.status === 'skipped',
  );
  const succeeded = [...report.fx, ...report.prices].filter(
    (i) => i.status === 'updated' || i.status === 'unchanged',
  );

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
              {problems.length === 0
                ? 'Prices refreshed'
                : `${problems.length} ${problems.length === 1 ? 'value' : 'values'} could not be fetched`}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              {report.updated > 0
                ? `${report.updated} ${report.updated === 1 ? 'value was' : 'values were'} updated.`
                : 'Nothing changed.'}
              {report.asOf && ` Exchange rates as of ${report.asOf}.`}
            </p>
          </div>
          <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {problems.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--critical)' }}>
                Not updated — enter these by hand
              </h3>
              <ul className="space-y-2">
                {problems.map((item, i) => (
                  <li
                    key={`${item.label}-${i}`}
                    className="rounded-[var(--r-md)] border p-3"
                    style={{
                      borderColor: 'var(--border)',
                      background: `linear-gradient(90deg, color-mix(in srgb, ${
                        item.status === 'failed' ? 'var(--critical)' : 'var(--warning)'
                      } 8%, var(--surface-1)) 0%, var(--surface-1) 45%)`,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{item.label}</span>
                      <span
                        className="chip"
                        style={
                          item.status === 'failed'
                            ? { background: 'var(--critical-soft)', color: 'var(--critical)' }
                            : { background: 'var(--warning-soft)', color: 'var(--ink-2)' }
                        }
                      >
                        <span aria-hidden>{item.status === 'failed' ? '✕' : '—'}</span>
                        {item.status === 'failed' ? 'Failed' : 'Skipped'}
                      </span>
                    </div>
                    {item.reason && (
                      <p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">{item.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-[var(--ink-3)]">
                Their existing values were left untouched. Every price and rate field stays
                editable — type the current value in yourself and the whole plan recalculates.
              </p>
            </section>
          )}

          {succeeded.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">
                {problems.length > 0 ? 'Updated successfully' : 'Everything is up to date'}
              </h3>
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
                {succeeded.map((item, i) => (
                  <li key={`${item.label}-${i}`} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                    <span className="font-medium">{item.label}</span>
                    {item.source && (
                      <span className="text-xs text-[var(--ink-3)]">{item.source}</span>
                    )}
                    <span className="num ml-auto text-sm">
                      {item.status === 'unchanged' ? (
                        <span className="text-[var(--ink-3)]">unchanged</span>
                      ) : (
                        <Change item={item} baseCurrency={baseCurrency} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 rounded-b-[var(--r-xl)] border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
          <button className="btn btn-primary !px-4 !py-2" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Old value in muted ink, new value in bold — deliberately not green/red. A
 * rate or price moving down is not "bad" (a cheaper share is good news when you
 * are buying), and the status colours are reserved for real states.
 */
function Change({ item, baseCurrency }: { item: RefreshItem; baseCurrency: string }) {
  const decimals = (item.to ?? 0) < 10 ? 4 : 2;
  return (
    <>
      {item.from !== undefined && (
        <span className="text-[var(--ink-3)]">{formatMoney(item.from, undefined, decimals)} → </span>
      )}
      <strong className="font-semibold text-[var(--ink-1)]">
        {formatMoney(item.to ?? 0, undefined, decimals)}
      </strong>
      {item.label.includes('→') && <span className="text-[var(--ink-3)]"> {baseCurrency}</span>}
    </>
  );
}
