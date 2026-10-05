import { TriangleAlert, X } from 'lucide-react';
import type { CalcResult, Settings } from '../types';

/**
 * The calculation's warnings, each paired with the action that resolves it
 * where there is one — so a warning is a shortcut, not just a complaint.
 *
 * Dismissing hides the current set; a different set of warnings shows again.
 */
export function PlanNotices({
  result,
  settings,
  dismissedKey,
  onDismiss,
  onNormalise,
  onFocusCash,
  onAllowSell,
  onOpenSettings,
}: {
  result: CalcResult;
  settings: Settings;
  dismissedKey: string | null;
  onDismiss: (key: string) => void;
  onNormalise: () => void;
  onFocusCash: (currency: string) => void;
  onAllowSell: () => void;
  onOpenSettings: () => void;
}) {
  const key = result.warnings.join('\n');
  if (result.warnings.length === 0 || key === dismissedKey) return null;

  const actions: { label: string; run: () => void }[] = [];
  if (Math.abs(result.targetWeightSum - 1) > 1e-6 && result.positions.length > 0) {
    actions.push({ label: 'Normalise targets to 100%', run: onNormalise });
  }
  for (const c of result.converted) {
    actions.push({ label: `Add ${c.currency} cash`, run: () => onFocusCash(c.currency) });
  }
  if (result.budgetLimited && !settings.allowSell) {
    actions.push({ label: 'Allow selling', run: onAllowSell });
  }
  if (result.cashRemaining < -1e-6) {
    actions.push({ label: 'Open settings', run: onOpenSettings });
  }

  return (
    <div
      role="status"
      className="mx-4 mt-4 flex gap-3 rounded-[var(--r-md)] border border-l-[3px] px-3.5 py-3 sm:mx-5"
      style={{
        borderColor: 'color-mix(in srgb, var(--warning) 45%, var(--border))',
        borderLeftColor: 'var(--warning)',
        background: 'var(--warning-soft)',
      }}
    >
      <TriangleAlert
        size={17}
        className="mt-0.5 shrink-0"
        style={{ color: 'var(--warning-ink)' }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <ul className="space-y-1 text-sm text-[var(--ink-1)]">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        {actions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {actions.map((a) => (
              <button key={a.label} className="btn !py-1 text-xs" onClick={a.run}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className="btn btn-ghost -mr-1 -mt-1 !h-7 !w-7 shrink-0 !p-0"
        onClick={() => onDismiss(key)}
        aria-label="Dismiss these warnings"
        title="Dismiss"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
