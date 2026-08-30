import { useEffect, useId, useRef, useState } from 'react';
import { parseNumber } from '../lib/format';

/**
 * A numeric field that keeps whatever the user is typing (including a lone
 * "-" or a trailing separator) and only reports a value once it parses.
 * Accepts "1'234.56", "1.234,56" and "1234,56".
 */
export function NumberField({
  value,
  onChange,
  suffix,
  align = 'right',
  step,
  min,
  max,
  className = '',
  ariaLabel,
  disabled,
  inputRef,
  inputId,
  commitOnChange,
  onEnter,
}: {
  value: number;
  onChange: (next: number) => void;
  suffix?: string;
  align?: 'left' | 'right';
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  inputId?: string;
  /**
   * Report each keystroke that parses, rather than waiting for blur. Use where
   * something on screen is derived from the value and would otherwise sit out
   * of step with what the field shows.
   */
  commitOnChange?: boolean;
  /**
   * Runs on Enter, receiving the value just committed. It is passed
   * explicitly because the parent's state has not updated yet at that point.
   */
  onEnter?: (committed: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatForEdit(value);
  const parsed = draft === null ? value : parseNumber(draft);
  const invalid = draft !== null && draft.trim() !== '' && parsed === null;

  function commit(raw: string): number {
    const n = parseNumber(raw);
    let committed = value;
    if (n !== null) {
      committed = clamp(n, min, max);
      onChange(committed);
    }
    setDraft(null);
    return committed;
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        id={inputId}
        ref={inputRef}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={`field num ${align === 'right' ? 'text-right' : ''} ${
          invalid ? 'field-invalid' : ''
        } ${disabled ? 'opacity-50' : ''} ${className}`}
        style={suffix ? { paddingRight: `${0.55 + suffix.length * 0.55}rem` } : undefined}
        value={shown}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!commitOnChange) return;
          const parsed = parseNumber(e.target.value);
          if (parsed !== null) onChange(clamp(parsed, min, max));
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const committed = commit((e.target as HTMLInputElement).value);
            if (onEnter) {
              e.preventDefault();
              onEnter(committed);
            } else {
              (e.target as HTMLInputElement).blur();
            }
          }
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

function clamp(n: number, min?: number, max?: number): number {
  let out = n;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

function formatForEdit(value: number): string {
  if (!Number.isFinite(value)) return '';
  // Trim float noise like 0.30000000000000004 without losing real precision.
  return String(Number(value.toPrecision(12)));
}

export function TextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      className={`field ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{
          background: checked ? 'var(--accent)' : 'var(--surface-2)',
          borderColor: checked ? 'var(--accent)' : 'var(--border-strong)',
        }}
      >
        <span
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all duration-200"
          style={{
            left: checked ? '1.125rem' : '0.125rem',
            boxShadow: '0 1px 3px rgb(15 23 42 / 0.3)',
          }}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-sm font-medium text-[var(--ink-1)]">{label}</span>
        {hint && <span className="block text-xs text-[var(--ink-3)]">{hint}</span>}
      </label>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className="flex-1 rounded-[0.4rem] px-2 py-1.5 text-xs font-[550] transition-all duration-150"
            style={{
              background: active ? 'var(--surface-1)' : 'transparent',
              color: active ? 'var(--ink-1)' : 'var(--ink-3)',
              boxShadow: active ? 'var(--shadow-card)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A card section with a title, optional description and header actions. */
export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-[var(--ink-1)]">{title}</h2>
          {description && (
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--ink-3)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Follows the cursor; used for chart marks. */
export function ChartTooltip({
  content,
  x,
  y,
}: {
  content: React.ReactNode;
  x: number;
  y: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 8);
    setOffset(overflow > 0 ? -overflow : 0);
  }, [content, x]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs"
      style={{ left: x + 12 + offset, top: y - 8, boxShadow: 'var(--shadow-raised)' }}
    >
      {content}
    </div>
  );
}
