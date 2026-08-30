import { useEffect, useId, useRef } from 'react';
import type { Portfolio, Settings } from '../types';
import { SettingsPanel } from './SettingsPanel';

/**
 * The calculation settings, as a dialog.
 *
 * They used to occupy a sidebar; moving them here lets the positions, charts
 * and trade plan use the full width of the window.
 */
export function SettingsDialog({
  open,
  portfolio,
  onChange,
  onClose,
  onRefreshFx,
  fxStatus,
}: {
  open: boolean;
  portfolio: Portfolio;
  onChange: (settings: Settings) => void;
  onClose: () => void;
  onRefreshFx: () => void;
  fxStatus: 'idle' | 'loading' | { asOf: string } | { error: string };
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

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

  if (!open) return null;

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
        className="card w-full max-w-xl !rounded-[var(--r-xl)]"
        style={{ boxShadow: 'var(--shadow-overlay)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 rounded-t-[var(--r-xl)] border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[1.0625rem] font-semibold tracking-[-0.02em]">
              Calculator settings
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              These drive the whole plan. Changes apply immediately.
            </p>
          </div>
          <button ref={closeRef} className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="px-5 py-5">
          <SettingsPanel
            portfolio={portfolio}
            onChange={onChange}
            onRefreshFx={onRefreshFx}
            fxStatus={fxStatus}
          />
        </div>

        <footer className="flex items-center justify-end rounded-b-[var(--r-xl)] border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
          <button className="btn btn-primary !px-4 !py-2" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
