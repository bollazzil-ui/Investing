import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CalcResult, Portfolio } from '../types';
import { applyPurchase, planPurchase } from '../lib/calc';
import { formatMoney, formatPercent, formatShares } from '../lib/format';
import { seriesColor } from '../lib/colors';
import { NumberField } from './primitives';

const PRESETS = [500, 1000, 2500, 5000, 10000];

/**
 * "What can I buy for this much?"
 *
 * Enter an amount, press OK for the share counts, then either save the
 * purchase into the portfolio or close and change nothing.
 */
export function BuyDialog({
  open,
  portfolio,
  onClose,
  onSave,
}: {
  open: boolean;
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (next: Portfolio) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  const [amount, setAmount] = useState(0);
  /** The amount the shown plan was computed for; null until OK is pressed. */
  const [computedFor, setComputedFor] = useState<number | null>(null);
  const [plan, setPlan] = useState<{ portfolio: Portfolio; result: CalcResult } | null>(null);

  const base = portfolio.settings.baseCurrency;

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    setAmount(portfolio.settings.cash > 0 ? portfolio.settings.cash : 0);
    setComputedFor(null);
    setPlan(null);
    const t = setTimeout(() => amountRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, portfolio.settings.cash]);

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
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  /**
   * `override` carries the value Enter just committed, which the `amount`
   * state does not hold yet at that moment.
   */
  const compute = useCallback(
    (override?: number) => {
      const value = override ?? amount;
      if (!(value > 0)) return;
      setPlan(planPurchase(portfolio, value));
      setComputedFor(value);
    },
    [amount, portfolio],
  );

  if (!open) return null;

  const stale = plan !== null && computedFor !== amount;
  const buys = plan ? plan.result.positions.filter((p) => p.tradeShares > 0) : [];
  const spent = buys.reduce((a, p) => a + p.tradeValueBase, 0);
  const canSave = plan !== null && !stale && buys.length > 0;

  function save() {
    if (!plan || stale) return;
    onSave(applyPurchase(portfolio, plan.result));
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              Buy shares
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              How much do you have to spend? Nothing is sold, and nothing changes until you save.
            </p>
          </div>
          <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {portfolio.positions.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--ink-2)]">
              Add at least one product to your portfolio first.
            </p>
          ) : (
            <>
              <div>
                <label className="label" htmlFor={`${titleId}-amount`}>
                  Money available to buy shares
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-semibold text-[var(--ink-3)]">{base}</span>
                  <div className="min-w-[10rem] flex-1">
                    <NumberField
                      inputRef={amountRef}
                      inputId={`${titleId}-amount`}
                      value={amount}
                      onChange={setAmount}
                      min={0}
                      align="left"
                      // The plan below is derived from this, so it must never
                      // sit out of step with what the field shows.
                      commitOnChange
                      ariaLabel="Money available to buy shares"
                      className="!py-2.5 !text-2xl !font-semibold"
                      onEnter={(committed) => compute(committed)}
                    />
                  </div>
                  <button
                    className="btn btn-primary !px-5 !py-2.5"
                    onClick={() => compute()}
                    disabled={!(amount > 0)}
                  >
                    OK
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESETS.map((v) => (
                    <button
                      key={v}
                      className="btn !px-2 !py-0.5 text-xs"
                      onClick={() => setAmount(v)}
                      style={amount === v ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                    >
                      {formatMoney(v, undefined, 0)}
                    </button>
                  ))}
                </div>
              </div>

              <div aria-live="polite">
                {plan === null && (
                  <p className="rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--ink-2)]">
                    Enter an amount and press <strong>OK</strong> to see what it buys.
                  </p>
                )}

                {stale && (
                  <p
                    className="mb-3 rounded-lg px-4 py-2.5 text-sm"
                    style={{ background: 'var(--warning-soft)' }}
                  >
                    The amount changed — press <strong>OK</strong> to work it out again.
                  </p>
                )}

                {plan && buys.length === 0 && !stale && (
                  <p className="rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--ink-2)]">
                    {formatMoney(amount, base)} does not cover a whole share of anything that is
                    below its target right now. Try a larger amount.
                  </p>
                )}

                {plan && buys.length > 0 && (
                  <div className={stale ? 'pointer-events-none opacity-40' : undefined}>
                    <h3 className="mb-2 text-sm font-semibold">
                      You can buy {buys.length === 1 ? 'this' : `these ${buys.length}`}
                    </h3>
                    <ul className="space-y-2">
                      {buys.map((p) => {
                        const i = plan.result.positions.findIndex((x) => x.id === p.id);
                        return (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3"
                            style={{ borderColor: 'var(--good)', background: 'var(--good-soft)' }}
                          >
                            <span
                              className="h-9 w-1.5 shrink-0 rounded-full"
                              style={{ background: seriesColor(i) }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 basis-40">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="num text-2xl font-bold tracking-tight">
                                  {formatShares(p.tradeShares)}
                                </span>
                                <span className="text-xs text-[var(--ink-2)]">
                                  share{p.tradeShares === 1 ? '' : 's'} of
                                </span>
                                <span className="text-base font-semibold">{p.ticker}</span>
                              </div>
                              <p className="truncate text-xs text-[var(--ink-3)]">{p.name}</p>
                            </div>
                            <div className="basis-full sm:basis-auto sm:text-right">
                              <div className="num font-semibold">
                                {formatMoney(p.tradeValueBase, base)}
                              </div>
                              <div className="num text-xs text-[var(--ink-3)]">
                                {p.currency !== base &&
                                  `${formatMoney(p.tradeValueLocal, p.currency)} · `}
                                {formatMoney(p.priceBase, base)} each
                              </div>
                            </div>
                            <div className="num basis-full text-xs text-[var(--ink-2)] sm:basis-auto sm:pl-2">
                              {formatShares(p.shares)} → <strong>{formatShares(p.newShares)}</strong>
                              <span className="block">
                                {formatPercent(p.actualWeight, 1)} →{' '}
                                <strong>{formatPercent(p.newWeight, 1)}</strong>
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">
                      {[
                        { k: 'Spent', v: formatMoney(spent, base) },
                        { k: 'Fees', v: formatMoney(plan.result.feesTotal, base) },
                        { k: 'Left over', v: formatMoney(plan.result.cashRemaining, base) },
                      ].map((cell) => (
                        <div key={cell.k} className="bg-[var(--surface-1)] px-3 py-2">
                          <dt className="text-[0.625rem] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)]">
                            {cell.k}
                          </dt>
                          <dd className="num mt-0.5 text-sm font-semibold">{cell.v}</dd>
                        </div>
                      ))}
                    </dl>

                    <p className="mt-3 text-xs leading-relaxed text-[var(--ink-3)]">
                      Saving adds these shares to your holdings and keeps{' '}
                      <strong className="num text-[var(--ink-2)]">
                        {formatMoney(plan.result.cashRemaining, base)}
                      </strong>{' '}
                      as cash to invest. Place the orders with your broker yourself.
                    </p>

                    {plan.result.warnings.length > 0 && (
                      <ul
                        className="mt-3 space-y-1 rounded-lg px-4 py-2.5 text-xs"
                        style={{ background: 'var(--warning-soft)' }}
                      >
                        {plan.result.warnings.map((w, i) => (
                          <li key={i}>⚠ {w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-5 py-3">
          <button className="btn" onClick={onClose}>
            Close without saving
          </button>
          <div className="ml-auto flex items-center gap-3">
            {plan && !canSave && !stale && buys.length === 0 && (
              <span className="text-xs text-[var(--ink-3)]">Nothing to save yet</span>
            )}
            <button className="btn btn-primary !px-4 !py-2" onClick={save} disabled={!canSave}>
              Save purchase
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
