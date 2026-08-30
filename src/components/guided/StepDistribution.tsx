import { useState } from 'react';
import type { CalcResult, Position, Settings } from '../../types';
import { formatMoney, formatPercent } from '../../lib/format';
import { equalizeWeights, normalizeWeights } from '../../lib/calc';
import { seriesColor } from '../../lib/colors';
import { NumberField, Toggle } from '../primitives';
import { StepNav } from './Stepper';

/**
 * Moves one position to `next` and rescales the others proportionally so the
 * total stays at exactly 100%. When the others are all at zero they share the
 * remainder equally, because there is no ratio to preserve.
 */
export function rebalanceOthers(positions: Position[], id: string, next: number): Position[] {
  const target = Math.min(1, Math.max(0, next));
  const others = positions.filter((p) => p.id !== id);
  if (others.length === 0) return positions.map((p) => ({ ...p, targetWeight: 1 }));

  const remainder = 1 - target;
  const othersSum = others.reduce((a, p) => a + p.targetWeight, 0);
  return positions.map((p) => {
    if (p.id === id) return { ...p, targetWeight: target };
    const share = othersSum > 1e-12 ? p.targetWeight / othersSum : 1 / others.length;
    return { ...p, targetWeight: remainder * share };
  });
}

export function StepDistribution({
  positions,
  settings,
  result,
  onChange,
  onBack,
  onNext,
}: {
  positions: Position[];
  settings: Settings;
  result: CalcResult;
  onChange: (next: Position[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [autoBalance, setAutoBalance] = useState(true);
  const base = settings.baseCurrency;
  const sum = result.targetWeightSum;
  const remaining = 1 - sum;
  const balanced = Math.abs(remaining) < 5e-5;
  const investable = result.investable;

  function setWeight(id: string, weight: number) {
    onChange(
      autoBalance
        ? rebalanceOthers(positions, id, weight)
        : positions.map((p) => (p.id === id ? { ...p, targetWeight: weight } : p)),
    );
  }

  return (
    <div className="card">
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="text-xl font-semibold tracking-[-0.022em] sm:text-[1.6rem] sm:leading-[1.2]">
          How should it be split?
        </h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--ink-2)]">
          The share of the whole portfolio each product should end up with.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Toggle
            checked={autoBalance}
            onChange={setAutoBalance}
            label="Keep the total at 100% for me"
            hint="Moving one product adjusts the others proportionally."
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => onChange(equalizeWeights(positions))}>
              Split evenly
            </button>
            {!balanced && (
              <button className="btn btn-primary" onClick={() => onChange(normalizeWeights(positions))}>
                Scale to 100%
              </button>
            )}
          </div>
        </div>

        {/* Live preview of the target split. */}
        <div className="mt-5 flex h-8 w-full overflow-hidden rounded-lg bg-[var(--surface-2)]">
          {positions.map((p, i) => {
            const w = sum > 0 ? Math.max(0, p.targetWeight) / Math.max(sum, 1) : 0;
            if (w <= 0) return null;
            return (
              <div
                key={p.id}
                className="flex items-center justify-center first:rounded-l-lg"
                style={{
                  width: `${w * 100}%`,
                  background: seriesColor(i),
                  marginRight: i < positions.length - 1 ? 2 : 0,
                }}
                title={`${p.ticker}: ${formatPercent(p.targetWeight, 1)}`}
              >
                {w > 0.085 && (
                  <span
                    className="num select-none px-1 text-[0.6875rem] font-semibold text-white"
                    style={{ textShadow: '0 1px 2px rgb(0 0 0 / 0.35)' }}
                  >
                    {formatPercent(p.targetWeight, 1)}
                  </span>
                )}
              </div>
            );
          })}
          {remaining > 5e-5 && (
            <div
              className="flex items-center justify-center rounded-r-lg text-[0.6875rem] font-semibold text-[var(--ink-3)]"
              style={{ width: `${remaining * 100}%` }}
            >
              {remaining > 0.085 && `${formatPercent(remaining, 1)} free`}
            </div>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {positions.map((p, i) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border)] px-3 py-2.5 sm:flex-nowrap"
            >
              <span
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ background: seriesColor(i) }}
                aria-hidden
              />
              <div className="w-28 shrink-0">
                <div className="truncate font-semibold">{p.ticker || `Product ${i + 1}`}</div>
                <div className="truncate text-xs text-[var(--ink-3)]">{p.name}</div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={Math.round(p.targetWeight * 1000) / 10}
                onChange={(e) => setWeight(p.id, Number(e.target.value) / 100)}
                aria-label={`Target share for ${p.ticker || `product ${i + 1}`}`}
                className="range min-w-[8rem] flex-1"
                style={{ '--thumb': seriesColor(i) } as React.CSSProperties}
              />
              <div className="w-24 shrink-0">
                <NumberField
                  value={Math.round(p.targetWeight * 10000) / 100}
                  onChange={(v) => setWeight(p.id, v / 100)}
                  min={0}
                  max={100}
                  suffix="%"
                  ariaLabel={`Target percent for ${p.ticker || `product ${i + 1}`}`}
                />
              </div>
              <div className="num w-28 shrink-0 text-right text-sm text-[var(--ink-2)]">
                {formatMoney(investable * p.targetWeight, base, 0)}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3"
          style={{
            background: balanced ? 'var(--good-soft)' : 'var(--warning-soft)',
          }}
        >
          <span className="text-sm font-medium">
            {balanced ? '✓ Adds up to 100%' : '⚠ Does not add up yet'}
          </span>
          <span className="num text-sm font-semibold">
            {formatPercent(sum)}
            {!balanced && (
              <span className="ml-2 font-normal text-[var(--ink-2)]">
                ({remaining > 0 ? `${formatPercent(remaining)} unallocated` : `${formatPercent(-remaining)} over`})
              </span>
            )}
          </span>
        </div>
      </div>

      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel="Show me what to buy"
        nextDisabled={!balanced}
        nextHint={balanced ? undefined : 'The split must add up to 100%'}
      />
    </div>
  );
}
