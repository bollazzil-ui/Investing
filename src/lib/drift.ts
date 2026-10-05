import type { Settings } from '../types';

export const DEFAULT_DRIFT_TOLERANCE = 0.005;

export type DriftTone = 'ok' | 'under' | 'over';

export function driftTolerance(settings: Pick<Settings, 'driftTolerance'>): number {
  const t = settings.driftTolerance;
  return typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : DEFAULT_DRIFT_TOLERANCE;
}

/**
 * Whether a drift is worth acting on. Inside the tolerance band it is "ok" and
 * shown in neutral ink, so a +0.01% rounding remainder never looks like a
 * problem. Outside it, the direction decides — never red/green, which reads as
 * loss/gain in a finance app.
 */
export function driftTone(drift: number, tolerance: number): DriftTone {
  if (!Number.isFinite(drift) || Math.abs(drift) <= tolerance + 1e-12) return 'ok';
  return drift > 0 ? 'over' : 'under';
}

export function driftColor(tone: DriftTone): string {
  return tone === 'ok' ? 'var(--ink-3)' : tone === 'over' ? 'var(--drift-over)' : 'var(--drift-under)';
}
