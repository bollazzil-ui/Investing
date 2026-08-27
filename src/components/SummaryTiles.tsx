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
  tone?: 'default' | 'accent' | 'good' | 'critical';
}) {
  const valueColor =
    tone === 'good'
      ? 'var(--good)'
      : tone === 'critical'
        ? 'var(--critical)'
        : tone === 'accent'
          ? 'var(--accent)'
          : 'var(--ink-1)';
  return (
    <div className="card px-4 py-3">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)]">
        {label}
      </div>
      <div className="num mt-1 text-lg font-semibold tracking-tight" style={{ color: valueColor }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-[var(--ink-3)]">{hint}</div>}
    </div>
  );
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
      <Tile label="Cash to invest" value={formatMoney(result.cash, currency)} hint="Liquider Teil" />
      <Tile
        label="Fees"
        value={formatMoney(result.feesTotal, currency)}
        hint="Deducted before targets"
      />
      <Tile
        label="Investable total"
        value={formatMoney(result.investable, currency)}
        hint="Holdings + cash − fees"
        tone="accent"
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
