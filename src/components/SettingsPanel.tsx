import type { Portfolio, Settings } from '../types';
import { NumberField, SegmentedControl, TextField, Toggle } from './primitives';

export function SettingsPanel({
  portfolio,
  onChange,
}: {
  portfolio: Portfolio;
  onChange: (settings: Settings) => void;
}) {
  const { settings } = portfolio;
  const base = settings.baseCurrency.toUpperCase();

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Base currency</label>
        <div className="w-32">
          <TextField
            value={settings.baseCurrency}
            onChange={(v) => set({ baseCurrency: v.toUpperCase().slice(0, 5) })}
            ariaLabel="Base currency"
            className="uppercase"
          />
        </div>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-[var(--ink-3)]">
          Everything is reported in this currency. Cash balances and exchange rates are edited in
          the <strong>Cash to invest</strong> section.
        </p>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <label className="label">Currency conversion</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <NumberField
              value={settings.conversionSpread * 100}
              onChange={(v) => set({ conversionSpread: v / 100 })}
              suffix="%"
              min={0}
              max={100}
              ariaLabel="Conversion spread percent"
            />
            <p className="mt-1 text-[0.6875rem] text-[var(--ink-3)]">Spread on the amount</p>
          </div>
          <div>
            <NumberField
              value={settings.conversionFee}
              onChange={(v) => set({ conversionFee: v })}
              suffix={base}
              min={0}
              ariaLabel="Flat conversion fee"
            />
            <p className="mt-1 text-[0.6875rem] text-[var(--ink-3)]">Flat, per currency</p>
          </div>
        </div>
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-[var(--ink-3)]">
          Charged only on the part of a purchase your matching cash balance cannot cover.
        </p>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
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
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-[var(--ink-3)]">
          Each position’s fee is entered in that position’s own currency.
        </p>
      </div>

      <div className="space-y-3 border-t border-[var(--border)] pt-4">
        <Toggle
          checked={settings.allowSell}
          onChange={(v) => set({ allowSell: v })}
          label="Allow selling"
          hint="Off means overweight positions are simply left alone and only buys are planned."
        />
        <Toggle
          checked={settings.useLeftoverCash}
          onChange={(v) => set({ useLeftoverCash: v })}
          label="Use up the leftover cash"
          hint="After the main plan, buy extra whole shares of whatever is still furthest below target."
        />
        <Toggle
          checked={settings.allowFractionalShares}
          onChange={(v) => set({ allowFractionalShares: v })}
          label="Fractional shares"
          hint="Skip whole-share rounding, for brokers that support fractions."
        />
      </div>
    </div>
  );
}
