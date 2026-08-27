import type { CalcResult, Settings } from '../../types';
import { formatMoney } from '../../lib/format';
import { NumberField } from '../primitives';
import { StepNav } from './Stepper';

const PRESETS = [500, 1000, 2500, 5000, 10000];

export function StepMoney({
  settings,
  result,
  onChange,
  onNext,
}: {
  settings: Settings;
  result: CalcResult;
  onChange: (next: Settings) => void;
  onNext: () => void;
}) {
  const base = settings.baseCurrency;

  return (
    <div className="card">
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          How much are you investing?
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          The new money you want to put in right now. Everything after this is worked out from it.
        </p>

        <div className="mt-6 max-w-md">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold text-[var(--ink-3)]">{base}</span>
            <NumberField
              value={settings.cash}
              onChange={(cash) => onChange({ ...settings, cash })}
              min={0}
              align="left"
              ariaLabel="Amount to invest"
              className="!py-3 !text-3xl !font-semibold"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((v) => (
              <button
                key={v}
                className="btn"
                onClick={() => onChange({ ...settings, cash: v })}
                style={
                  settings.cash === v
                    ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                    : undefined
                }
              >
                {formatMoney(v, undefined, 0)}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="mt-8">
          <legend className="text-sm font-semibold">And how should it be invested?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              {
                sell: false,
                title: 'Buy only',
                body: 'Put the new money where it is most needed. Nothing is ever sold, so you pay no extra fees and trigger no tax events.',
                tag: 'Most common',
              },
              {
                sell: true,
                title: 'Full rebalance',
                body: 'Also sell whatever is overweight to hit the target split exactly. Costs more in fees.',
                tag: null,
              },
            ].map((opt) => {
              const active = settings.allowSell === opt.sell;
              return (
                <button
                  key={opt.title}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...settings, allowSell: opt.sell })}
                  className="rounded-xl border-2 p-4 text-left transition-colors"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface-1)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
                        background: active ? 'var(--accent)' : 'transparent',
                      }}
                      aria-hidden
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="font-semibold">{opt.title}</span>
                    {opt.tag && (
                      <span
                        className="chip"
                        style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                      >
                        {opt.tag}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-2)]">{opt.body}</p>
                </button>
              );
            })}
          </div>
        </fieldset>

        {result.currentTotal > 0 && (
          <p className="mt-6 text-sm text-[var(--ink-2)]">
            You already hold{' '}
            <strong className="num font-semibold text-[var(--ink-1)]">
              {formatMoney(result.currentTotal, base)}
            </strong>{' '}
            across {result.positions.length} position
            {result.positions.length === 1 ? '' : 's'}, so the plan will work with{' '}
            <strong className="num font-semibold text-[var(--ink-1)]">
              {formatMoney(result.currentTotal + settings.cash, base)}
            </strong>{' '}
            in total.
          </p>
        )}
      </div>
      <StepNav onNext={onNext} nextLabel="Choose products" />
    </div>
  );
}
