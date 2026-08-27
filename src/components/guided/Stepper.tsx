export interface StepDef {
  id: number;
  title: string;
  short: string;
}

export const STEPS: StepDef[] = [
  { id: 0, title: 'Your money', short: 'Money' },
  { id: 1, title: 'Your products', short: 'Products' },
  { id: 2, title: 'Your split', short: 'Split' },
  { id: 3, title: 'What to buy', short: 'Buy' },
];

export function Stepper({
  current,
  furthest,
  onGo,
}: {
  current: number;
  /** The highest step reached so far; anything up to it stays clickable. */
  furthest: number;
  onGo: (step: number) => void;
}) {
  return (
    <nav aria-label="Progress" className="no-print">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const state = s.id === current ? 'current' : s.id < current ? 'done' : 'todo';
          const reachable = s.id <= furthest;
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => reachable && onGo(s.id)}
                disabled={!reachable}
                aria-current={state === 'current' ? 'step' : undefined}
                className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-default"
                style={{ background: state === 'current' ? 'var(--accent-soft)' : 'transparent' }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{
                    background:
                      state === 'todo'
                        ? 'var(--surface-2)'
                        : state === 'done'
                          ? 'var(--good)'
                          : 'var(--accent)',
                    color: state === 'todo' ? 'var(--ink-3)' : '#fff',
                  }}
                >
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span
                  className="hidden truncate text-sm font-medium sm:block"
                  style={{
                    color: state === 'current' ? 'var(--accent)' : 'var(--ink-2)',
                  }}
                >
                  {s.title}
                </span>
                <span
                  className="truncate text-xs font-medium sm:hidden"
                  style={{ color: state === 'current' ? 'var(--accent)' : 'var(--ink-2)' }}
                >
                  {s.short}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  className="hidden h-px w-3 shrink-0 sm:block"
                  style={{ background: 'var(--border-strong)' }}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back / next bar shared by every step. */
export function StepNav({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  nextHint,
  backLabel = 'Back',
  children,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextHint?: string;
  backLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-4 py-3 sm:px-5">
      {onBack && (
        <button className="btn" onClick={onBack}>
          ← {backLabel}
        </button>
      )}
      {children}
      <div className="ml-auto flex items-center gap-3">
        {nextHint && <span className="text-xs text-[var(--ink-3)]">{nextHint}</span>}
        {onNext && (
          <button className="btn btn-primary !px-4 !py-2" onClick={onNext} disabled={nextDisabled}>
            {nextLabel} →
          </button>
        )}
      </div>
    </div>
  );
}
