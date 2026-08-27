import { useMemo } from 'react';
import type { Portfolio, Settings } from '../types';
import { NumberField, SegmentedControl, Section, TextField, Toggle } from './primitives';

export function SettingsPanel({
  portfolio,
  onChange,
  onRefreshFx,
  fxStatus,
}: {
  portfolio: Portfolio;
  onChange: (settings: Settings) => void;
  onRefreshFx: () => void;
  fxStatus: 'idle' | 'loading' | { asOf: string } | { error: string };
}) {
  const { settings, positions } = portfolio;
  const base = settings.baseCurrency.toUpperCase();

  // Only the currencies actually used by a position need a rate.
  const currencies = useMemo(() => {
    const set = new Set(positions.map((p) => p.currency.toUpperCase()).filter((c) => c && c !== base));
    return [...set].sort();
  }, [positions, base]);

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <Section
      title="Calculation settings"
      description="These drive the whole plan. Everything is reported in the base currency."
    >
      <div className="space-y-5 px-4 py-4 sm:px-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Base currency</label>
            <TextField
              value={settings.baseCurrency}
              onChange={(v) => set({ baseCurrency: v.toUpperCase().slice(0, 5) })}
              ariaLabel="Base currency"
              className="uppercase"
            />
          </div>
          <div>
            <label className="label">Cash to invest</label>
            <NumberField
              value={settings.cash}
              onChange={(v) => set({ cash: v })}
              suffix={base}
              ariaLabel="Cash to invest"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="label !mb-0">Exchange rates</span>
            <button
              className="btn !px-2 !py-0.5 text-xs"
              onClick={onRefreshFx}
              disabled={fxStatus === 'loading' || currencies.length === 0}
            >
              {fxStatus === 'loading' ? 'Fetching…' : 'Fetch live'}
            </button>
          </div>
          {currencies.length === 0 ? (
            <p className="text-xs text-[var(--ink-3)]">
              Every position is already in {base}; no rates needed.
            </p>
          ) : (
            <div className="space-y-2">
              {currencies.map((code) => (
                <div key={code} className="flex items-center gap-2">
                  <span className="num w-24 shrink-0 text-xs text-[var(--ink-2)]">1 {code} =</span>
                  <NumberField
                    value={settings.fxRates[code] ?? 1}
                    onChange={(v) =>
                      set({ fxRates: { ...settings.fxRates, [code]: v } })
                    }
                    suffix={base}
                    min={0}
                    ariaLabel={`Exchange rate ${code} to ${base}`}
                  />
                </div>
              ))}
            </div>
          )}
          {typeof fxStatus === 'object' && 'asOf' in fxStatus && (
            <p className="mt-1.5 text-[0.6875rem]" style={{ color: 'var(--good)' }}>
              ✓ ECB reference rates from {fxStatus.asOf}
            </p>
          )}
          {typeof fxStatus === 'object' && 'error' in fxStatus && (
            <p className="mt-1.5 text-[0.6875rem]" style={{ color: 'var(--critical)' }}>
              ✕ {fxStatus.error}
            </p>
          )}
        </div>

        <div>
          <label className="label">Share rounding</label>
          <SegmentedControl
            ariaLabel="Share rounding"
            value={settings.rounding}
            onChange={(v) => set({ rounding: v })}
            options={[
              { value: 'truncate', label: 'Toward zero', hint: 'Excel ROUNDDOWN — never overshoots, never sells on a tiny drift' },
              { value: 'floor', label: 'Down', hint: 'Always rounds down, so small overweights do get sold' },
              { value: 'nearest', label: 'Nearest', hint: 'Closest whole share, may overshoot the cash available' },
            ]}
          />
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-[var(--ink-3)]">
            {settings.rounding === 'truncate' &&
              'Matches the original spreadsheet: fractions are dropped in the direction of zero, so a −0.8 share gap is left alone.'}
            {settings.rounding === 'floor' &&
              'Always rounds down, so a −0.8 share gap becomes a 1-share sell.'}
            {settings.rounding === 'nearest' &&
              'Rounds to the closest whole share, which can spend slightly more than the available cash.'}
          </p>
        </div>

        <div>
          <label className="label">Fees</label>
          <SegmentedControl
            ariaLabel="Fee handling"
            value={settings.feeMode}
            onChange={(v) => set({ feeMode: v })}
            options={[
              { value: 'all', label: 'Charge all', hint: 'Every position’s fee is reserved up front' },
              { value: 'traded', label: 'Only if traded', hint: 'Reserve a fee only where a trade is actually planned' },
            ]}
          />
        </div>

        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <Toggle
            checked={settings.allowSell}
            onChange={(v) => set({ allowSell: v })}
            label="Allow selling"
            hint="Off means overweight positions are simply left alone and only buys are planned."
          />
          <Toggle
            checked={settings.allowFractionalShares}
            onChange={(v) => set({ allowFractionalShares: v })}
            label="Fractional shares"
            hint="Skip whole-share rounding, for brokers that support fractions."
          />
        </div>
      </div>
    </Section>
  );
}
