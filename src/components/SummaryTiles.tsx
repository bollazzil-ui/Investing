import type { CalcResult } from '../types';
import { formatMoney, formatSignedMoney } from '../lib/format';

function Tile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'hero' | 'good' | 'critical';
}) {
  const hero = tone === 'hero';
  const valueColor =
    tone === 'good' ? 'var(--good)' : tone === 'critical' ? 'var(--critical)' : 'var(--ink-1)';
  return (
    <div className={`card px-4 py-3.5 ${hero ? 'card-hero' : ''}`}>
      <div
        className={`text-[0.6875rem] font-[650] uppercase tracking-[0.06em] ${
          hero ? 'hero-label' : 'text-[var(--ink-3)]'
        }`}
      >
        {label}
      </div>
      <div
        className={`num mt-1.5 text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] ${
          hero ? 'hero-value' : ''
        }`}
        style={hero ? undefined : { color: valueColor }}
      >
        {value}
      </div>
      {hint && (
        <div className={`mt-1 text-xs ${hero ? 'hero-hint' : 'text-[var(--ink-3)]'}`}>{hint}</div>
      )}
    </div>
  );
}

/** With one balance the total says it all; with several, show the mix. */
function cashHint(result: CalcResult, currency: string): string {
  const entries = Object.entries(result.cashBalances).filter(([, v]) => v > 0);
  if (entries.length <= 1) return 'Liquider Teil';
  return entries
    .sort(([a], [b]) => (a === currency ? -1 : b === currency ? 1 : a.localeCompare(b)))
    .map(([code, amount]) => `${formatMoney(amount, code, 0)}`)
    .join(' + ');
}

export function SummaryTiles({ result, currency }: { result: CalcResult; currency: string }) {
  const growth = result.newTotal - result.currentTotal;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <Tile
        label="Holdings now"
        value={formatMoney(result.currentTotal, currency)}
        hint={`${result.positions.length} position${result.positions.length === 1 ? '' : 's'}`}
      />
      <Tile
        label="Cash to invest"
        value={formatMoney(result.cash, currency)}
        hint={cashHint(result, currency)}
      />
      <Tile
        label="Fees"
        value={formatMoney(result.feesTotal, currency)}
        hint={
          Math.abs(result.feesReserved - result.feesTotal) > 1e-9
            ? `${formatMoney(result.feesReserved, currency)} reserved`
            : 'On the trades planned'
        }
      />
      <Tile
        label="Investable total"
        value={formatMoney(result.investable, currency)}
        hint="Holdings + cash − reserved fees"
        tone="hero"
      />
      <Tile
        label="After trades"
        value={formatMoney(result.newTotal, currency)}
        hint={`${formatSignedMoney(growth, currency)} from trading`}
      />
      <Tile
        label="Cash left over"
        value={formatMoney(result.cashRemaining, currency)}
        hint={result.cashRemaining < -1e-6 ? 'Plan exceeds available cash' : 'Not invested'}
        tone={result.cashRemaining < -1e-6 ? 'critical' : 'default'}
      />
    </div>
  );
}
