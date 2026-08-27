import { useState } from 'react';
import type { CalcResult } from '../types';
import { formatMoney, formatPercent, formatSignedPercent } from '../lib/format';
import { seriesColor } from '../lib/colors';
import { ChartTooltip, Section } from './primitives';

type Hover = { key: string; label: string; lines: [string, string][]; x: number; y: number };

/**
 * Composition bars (now vs. target vs. after trading) plus a diverging drift
 * bar per position. Identity is carried by the legend and by direct labels,
 * never by color alone.
 */
export function AllocationChart({
  result,
  currency,
  showAfter,
}: {
  result: CalcResult;
  currency: string;
  showAfter: boolean;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const positions = result.positions;

  if (positions.length === 0) {
    return (
      <Section title="Allocation" description="Add a position to see the allocation.">
        <div className="px-5 py-10 text-center text-sm text-[var(--ink-3)]">Nothing to show yet.</div>
      </Section>
    );
  }

  const bars: { label: string; hint: string; get: (i: number) => number }[] = [
    { label: 'Now', hint: 'current weights', get: (i) => positions[i].actualWeight },
    { label: 'Target', hint: 'what you asked for', get: (i) => positions[i].targetWeight },
  ];
  if (showAfter) {
    bars.push({ label: 'After trades', hint: 'once the plan is executed', get: (i) => positions[i].newWeight });
  }

  const maxAbsDrift = Math.max(
    0.005,
    ...positions.map((p) => Math.abs(p.driftWeight)),
    ...positions.map((p) => Math.abs(p.newDrift)),
  );

  return (
    <>
      <Section
        title="Allocation"
        description="How the portfolio is split today, what you are aiming for, and where it lands after the plan."
      >
        <div className="space-y-5 px-4 py-4 sm:px-5">
          {/* Legend — identity is never color-alone. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {positions.map((p, i) => (
              <li key={p.id} className="flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: seriesColor(i) }}
                  aria-hidden
                />
                <span className="font-medium text-[var(--ink-1)]">{p.ticker || p.name || '—'}</span>
                <span className="num text-[var(--ink-3)]">{formatPercent(p.targetWeight, 1)}</span>
              </li>
            ))}
          </ul>

          {/* Composition bars. A 2px surface gap separates adjacent segments. */}
          <div className="space-y-3">
            {bars.map((bar) => {
              const total = positions.reduce((a, _p, i) => a + Math.max(0, bar.get(i)), 0) || 1;
              return (
                <div key={bar.label}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-xs font-medium text-[var(--ink-1)]">{bar.label}</span>
                    <span className="text-[0.6875rem] text-[var(--ink-3)]">{bar.hint}</span>
                  </div>
                  <div className="flex h-7 w-full overflow-hidden rounded-md bg-[var(--surface-2)]">
                    {positions.map((p, i) => {
                      const w = Math.max(0, bar.get(i)) / total;
                      if (w <= 0) return null;
                      const key = `${bar.label}-${p.id}`;
                      const wide = w > 0.085;
                      return (
                        <div
                          key={key}
                          className="relative flex items-center justify-center transition-[filter] first:rounded-l-md last:rounded-r-md"
                          style={{
                            width: `${w * 100}%`,
                            background: seriesColor(i),
                            marginRight: i < positions.length - 1 ? 2 : 0,
                            filter: hover && hover.key !== key ? 'saturate(0.55) opacity(0.65)' : undefined,
                          }}
                          onMouseMove={(e) =>
                            setHover({
                              key,
                              label: `${p.ticker || p.name} · ${bar.label}`,
                              lines: [
                                ['Weight', formatPercent(bar.get(i))],
                                ['Target', formatPercent(p.targetWeight)],
                                [
                                  'Value',
                                  formatMoney(
                                    bar.label === 'Now'
                                      ? p.valueBase
                                      : bar.label === 'Target'
                                        ? p.targetValue
                                        : p.newValueBase,
                                    currency,
                                  ),
                                ],
                              ],
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseLeave={() => setHover(null)}
                        >
                          {wide && (
                            <span
                              className="num select-none px-1 text-[0.6875rem] font-semibold text-white mix-blend-normal"
                              style={{ textShadow: '0 1px 2px rgb(0 0 0 / 0.35)' }}
                            >
                              {formatPercent(bar.get(i), 1)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Diverging drift: blue = underweight (buy), red = overweight (sell). */}
          <div className="border-t border-[var(--border)] pt-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-[var(--ink-1)]">Drift from target</span>
              <span className="flex items-center gap-3 text-[0.6875rem] text-[var(--ink-3)]">
                <span className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: 'var(--diverge-neg)' }}
                    aria-hidden
                  />
                  ▼ underweight
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: 'var(--diverge-pos)' }}
                    aria-hidden
                  />
                  ▲ overweight
                </span>
              </span>
            </div>
            <div className="space-y-1.5">
              {positions.map((p) => {
                const before = p.driftWeight;
                const after = p.newDrift;
                const key = `drift-${p.id}`;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate text-xs font-medium text-[var(--ink-2)]">
                      {p.ticker || p.name || '—'}
                    </span>
                    <div
                      className="relative h-5 flex-1 rounded"
                      style={{ background: 'var(--surface-2)' }}
                      onMouseMove={(e) =>
                        setHover({
                          key,
                          label: p.ticker || p.name,
                          lines: [
                            ['Drift now', formatSignedPercent(before)],
                            ['Drift after', formatSignedPercent(after)],
                            ['Gap to target', formatMoney(p.deltaValue, currency)],
                          ],
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    >
                      {/* zero line */}
                      <span
                        className="absolute inset-y-0 left-1/2 w-px"
                        style={{ background: 'var(--border-strong)' }}
                        aria-hidden
                      />
                      {[
                        { v: before, opacity: 0.35, h: 'h-4', top: 'top-0.5' },
                        { v: after, opacity: 1, h: 'h-2', top: 'top-1.5' },
                      ].map((band, bi) => {
                        const frac = Math.min(1, Math.abs(band.v) / maxAbsDrift) * 0.5;
                        if (frac <= 0.0005) return null;
                        const positive = band.v > 0;
                        return (
                          <span
                            key={bi}
                            className={`absolute ${band.h} ${band.top} rounded-[3px]`}
                            style={{
                              left: positive ? '50%' : `${(0.5 - frac) * 100}%`,
                              width: `${frac * 100}%`,
                              background: positive ? 'var(--diverge-pos)' : 'var(--diverge-neg)',
                              opacity: band.opacity,
                            }}
                            aria-hidden
                          />
                        );
                      })}
                    </div>
                    <span
                      className="num w-20 shrink-0 text-right text-xs font-medium"
                      style={{
                        color:
                          Math.abs(after) < 5e-5
                            ? 'var(--ink-3)'
                            : after > 0
                              ? 'var(--diverge-pos)'
                              : 'var(--diverge-neg)',
                      }}
                    >
                      {Math.abs(after) < 5e-5 ? 'on target' : formatSignedPercent(after)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[0.6875rem] text-[var(--ink-3)]">
              Faint bar = drift today, solid bar = drift once the plan is executed.
            </p>
          </div>
        </div>
      </Section>

      {hover && (
        <ChartTooltip
          x={hover.x}
          y={hover.y}
          content={
            <div>
              <div className="mb-1 font-semibold text-[var(--ink-1)]">{hover.label}</div>
              <dl className="space-y-0.5">
                {hover.lines.map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="text-[var(--ink-3)]">{k}</dt>
                    <dd className="num ml-auto font-medium text-[var(--ink-1)]">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          }
        />
      )}
    </>
  );
}
