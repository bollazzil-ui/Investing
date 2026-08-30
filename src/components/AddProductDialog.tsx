import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Position } from '../types';
import { uid } from '../lib/format';
import { looksLikeIsin, normalizeIsin } from '../lib/isin';
import { lookupInstrument, type FieldSource, type InstrumentLookup } from '../lib/lookup';
import { NumberField, TextField } from './primitives';

/** Identity-only starting points, for when the user has no code to hand. */
export interface ProductPreset {
  ticker: string;
  name: string;
  isin: string;
  currency: string;
  quoteSymbol?: string;
}

export const PRODUCT_PRESETS: ProductPreset[] = [
  { ticker: 'SWDA', name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', currency: 'USD', quoteSymbol: 'swda.uk' },
  { ticker: 'EIMI', name: 'iShares Core MSCI EM IMI', isin: 'IE00BKM4GZ66', currency: 'USD', quoteSymbol: 'eimi.uk' },
  { ticker: 'IUSN', name: 'iShares MSCI World Small Cap', isin: 'IE00BF4RFH31', currency: 'EUR', quoteSymbol: 'iusn.de' },
  { ticker: 'VWRL', name: 'Vanguard FTSE All-World', isin: 'IE00B3RBWM25', currency: 'USD', quoteSymbol: 'vwrl.uk' },
  { ticker: 'AGGH', name: 'iShares Core Global Aggregate Bond', isin: 'IE00BDBRDM35', currency: 'USD', quoteSymbol: 'aggh.uk' },
];

type Status = 'idle' | 'loading' | 'done' | 'error';

interface Draft {
  ticker: string;
  name: string;
  isin: string;
  currency: string;
  unitPrice: number;
  shares: number;
  fee: number;
  quoteSymbol: string;
}

/** Small marker showing where a field's value came from. */
function SourceBadge({ source }: { source: FieldSource }) {
  if (source === 'none') return null;
  const found = source === 'lookup';
  return (
    <span
      className="chip ml-1.5 !py-0"
      style={{
        background: found ? 'var(--good-soft)' : 'var(--warning-soft)',
        color: found ? 'var(--good)' : 'var(--ink-2)',
      }}
      title={
        found
          ? 'Filled in from the lookup'
          : 'Inferred from the listing exchange — please confirm it'
      }
    >
      {found ? '✓ found' : '⚠ check'}
    </span>
  );
}

export function AddProductDialog({
  open,
  onClose,
  onAdd,
  baseCurrency,
  defaultFee,
  suggestedWeight,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (position: Position) => void;
  baseCurrency: string;
  defaultFee: number;
  /** Target weight given to the new product, usually whatever is unallocated. */
  suggestedWeight: number;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastLookedUp = useRef<string>('');
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<InstrumentLookup | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(baseCurrency, defaultFee));

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    lastLookedUp.current = '';
    setQuery('');
    setStatus('idle');
    setError(null);
    setFound(null);
    setDraft(emptyDraft(baseCurrency, defaultFee));
  }, [baseCurrency, defaultFee]);

  // Open: remember what had focus, reset the form, focus the code field.
  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    reset();
    const t = setTimeout(() => queryRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, reset]);

  // Close: stop any in-flight lookup and hand focus back.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    restoreFocusTo.current?.focus?.();
  }, [open]);

  // Keep the page behind the dialog still while it is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes; Tab is trapped inside the dialog.
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
        'button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
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

  /** The heart of it: leaving the code field fills in everything else. */
  const runLookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === lastLookedUp.current) return;
      lastLookedUp.current = trimmed;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('loading');
      setError(null);
      setFound(null);
      try {
        const result = await lookupInstrument(trimmed, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setFound(result);
        setStatus('done');
        setDraft((d) => ({
          ...d,
          // Only overwrite what the lookup actually established.
          ticker: result.ticker ?? d.ticker,
          name: result.name ?? d.name,
          isin: result.isin ?? d.isin,
          currency: result.currency ?? d.currency,
          unitPrice: result.unitPrice ?? d.unitPrice,
          quoteSymbol: result.quoteSymbol ?? d.quoteSymbol,
        }));
      } catch (e) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : 'The lookup failed.');
        // A bad code should not wipe what the user already typed.
        if (looksLikeIsin(trimmed)) {
          setDraft((d) => ({ ...d, isin: normalizeIsin(trimmed) }));
        }
      }
    },
    [],
  );

  function applyPreset(preset: ProductPreset) {
    lastLookedUp.current = '';
    setQuery(preset.isin);
    setStatus('idle');
    setError(null);
    setFound(null);
    setDraft((d) => ({
      ...d,
      ticker: preset.ticker,
      name: preset.name,
      isin: preset.isin,
      currency: preset.currency,
      quoteSymbol: preset.quoteSymbol ?? '',
    }));
  }

  const canAdd = draft.ticker.trim() !== '' && draft.unitPrice > 0;

  function submit() {
    if (!canAdd) return;
    onAdd({
      id: uid(),
      ticker: draft.ticker.trim().toUpperCase(),
      name: draft.name.trim(),
      isin: draft.isin.trim() || undefined,
      currency: (draft.currency.trim() || baseCurrency).toUpperCase(),
      unitPrice: draft.unitPrice,
      shares: draft.shares,
      targetWeight: suggestedWeight,
      fee: draft.fee,
      quoteSymbol: draft.quoteSymbol.trim() || undefined,
    });
    onClose();
  }

  if (!open) return null;

  const src = found?.sources;

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
              Add a product
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              Enter an ISIN or ticker and the rest is filled in for you.
            </p>
          </div>
          <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {/* Step 1 — the only field the user has to think about. */}
          <div>
            <label className="label" htmlFor={`${titleId}-q`}>
              ISIN or ticker symbol
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id={`${titleId}-q`}
                  ref={queryRef}
                  type="text"
                  className="field !py-2.5 font-mono text-base tracking-wide"
                  placeholder="IE00B4L5Y983  or  SWDA"
                  value={query}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${titleId}-status`}
                  aria-busy={status === 'loading'}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={(e) => void runLookup(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void runLookup((e.target as HTMLInputElement).value);
                    }
                  }}
                />
                {status === 'loading' && (
                  <span
                    className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]"
                    aria-hidden
                  />
                )}
              </div>
              <button
                className="btn"
                onClick={() => {
                  lastLookedUp.current = '';
                  void runLookup(query);
                }}
                disabled={!query.trim() || status === 'loading'}
              >
                Look up
              </button>
            </div>

            <div id={`${titleId}-status`} aria-live="polite" className="mt-2 space-y-1 text-xs">
              {status === 'loading' && (
                <p className="text-[var(--ink-2)]">Looking up {query.trim()}…</p>
              )}
              {status === 'error' && error && (
                <p style={{ color: 'var(--critical)' }}>✕ {error}</p>
              )}
              {status === 'done' && found && (
                <>
                  {/* Only claim a find when the directory actually answered. */}
                  {found.sources.ticker === 'lookup' && (
                    <p style={{ color: 'var(--good)' }}>
                      ✓ Found {found.name ?? found.ticker}
                      {found.exchange ? ` on ${found.exchange}` : ''}
                    </p>
                  )}
                  {found.notes.map((n, i) => (
                    <p key={i} className="text-[var(--ink-2)]">
                      • {n}
                    </p>
                  ))}
                </>
              )}
              {status === 'idle' && (
                <p className="text-[var(--ink-3)]">
                  The details fill in when you leave this field. You can always edit them below.
                </p>
              )}
            </div>
          </div>

          {/* Step 2 — everything else, pre-filled but always editable. */}
          <div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
            <div>
              <label className="label">
                Ticker
                {src && <SourceBadge source={src.ticker} />}
              </label>
              <TextField
                value={draft.ticker}
                onChange={(v) => setDraft({ ...draft, ticker: v.toUpperCase() })}
                placeholder="SWDA"
                ariaLabel="Ticker"
                className="font-semibold"
              />
            </div>
            <div>
              <label className="label">
                Name
                {src && <SourceBadge source={src.name} />}
              </label>
              <TextField
                value={draft.name}
                onChange={(v) => setDraft({ ...draft, name: v })}
                placeholder="iShares Core MSCI World"
                ariaLabel="Product name"
              />
            </div>
            <div>
              <label className="label">ISIN</label>
              <TextField
                value={draft.isin}
                onChange={(v) => setDraft({ ...draft, isin: v.toUpperCase() })}
                placeholder="IE00B4L5Y983"
                ariaLabel="ISIN"
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">
                  Currency
                  {src && <SourceBadge source={src.currency} />}
                </label>
                <TextField
                  value={draft.currency}
                  onChange={(v) => setDraft({ ...draft, currency: v.toUpperCase().slice(0, 5) })}
                  ariaLabel="Currency"
                  className="text-center uppercase"
                />
              </div>
              <div>
                <label className="label">
                  Price
                  {src && <SourceBadge source={src.unitPrice} />}
                </label>
                <NumberField
                  value={draft.unitPrice}
                  onChange={(v) => setDraft({ ...draft, unitPrice: v })}
                  min={0}
                  ariaLabel="Price per share"
                />
              </div>
            </div>
            <div>
              <label className="label">Shares you already hold</label>
              <NumberField
                value={draft.shares}
                onChange={(v) => setDraft({ ...draft, shares: v })}
                min={0}
                ariaLabel="Shares held"
              />
              <p className="mt-1 text-[0.6875rem] text-[var(--ink-3)]">
                Leave at 0 for a product you are buying for the first time.
              </p>
            </div>
            <div>
              <label className="label">Trading fee</label>
              <NumberField
                value={draft.fee}
                onChange={(v) => setDraft({ ...draft, fee: v })}
                min={0}
                suffix={draft.currency || baseCurrency}
                ariaLabel="Trading fee"
              />
              <p className="mt-1 text-[0.6875rem] text-[var(--ink-3)]">
                In the product’s own currency.
              </p>
            </div>
          </div>

          {/* A way in for someone who has no code to hand. */}
          <div className="border-t border-[var(--border)] pt-4">
            <p className="label !mb-2">Or start from a common ETF</p>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_PRESETS.map((preset) => (
                <button
                  key={preset.isin}
                  className="btn"
                  onClick={() => applyPreset(preset)}
                  title={`${preset.name} · ${preset.isin}`}
                >
                  {preset.ticker}
                  <span className="text-[var(--ink-3)]">{preset.currency}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-3 rounded-b-[var(--r-xl)] border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <div className="ml-auto flex items-center gap-3">
            {!canAdd && (
              <span className="text-xs text-[var(--ink-3)]">
                {draft.ticker.trim() === '' ? 'A ticker is required' : 'A price per share is required'}
              </span>
            )}
            <button className="btn btn-primary !px-4 !py-2" onClick={submit} disabled={!canAdd}>
              Add to portfolio
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function emptyDraft(baseCurrency: string, defaultFee: number): Draft {
  return {
    ticker: '',
    name: '',
    isin: '',
    currency: baseCurrency,
    unitPrice: 0,
    shares: 0,
    fee: defaultFee,
    quoteSymbol: '',
  };
}
