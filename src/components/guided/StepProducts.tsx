import { useState } from 'react';
import type { CalcResult, Position, Settings } from '../../types';
import { formatMoney } from '../../lib/format';
import { seriesColor } from '../../lib/colors';
import { NumberField, TextField } from '../primitives';
import { AddProductDialog } from '../AddProductDialog';
import { StepNav } from './Stepper';

export function StepProducts({
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
  const [adding, setAdding] = useState(false);
  const base = settings.baseCurrency;
  const unallocated = Math.max(0, 1 - positions.reduce((a, p) => a + p.targetWeight, 0));

  function update(id: string, patch: Partial<Position>) {
    onChange(positions.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }


  function remove(p: Position) {
    const label = p.ticker || p.name || 'this product';
    if (p.shares > 0 && !confirm(`Remove ${label}? You still hold ${p.shares} shares of it, and they will no longer be counted.`)) {
      return;
    }
    onChange(positions.filter((x) => x.id !== p.id));
  }

  const incomplete = positions.filter((p) => !(p.unitPrice > 0) || !p.ticker.trim());

  return (
    <div className="card">
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="text-xl font-semibold tracking-[-0.022em] sm:text-[1.6rem] sm:leading-[1.2]">
          Which products are in your portfolio?
        </h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--ink-2)]">
          Add anything new, remove what you no longer want. Enter what you already hold so the plan
          works from your real starting point — a brand-new product simply has 0 shares.
        </p>

        <div className="mt-6 space-y-3">
          {positions.map((p, i) => {
            const r = result.positions.find((x) => x.id === p.id);
            return (
              <div
                key={p.id}
                className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: seriesColor(i) }}
                    aria-hidden
                  />
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[7rem_1fr_5rem_8rem_7rem]">
                    <div>
                      <label className="label">Ticker</label>
                      <TextField
                        value={p.ticker}
                        onChange={(v) => update(p.id, { ticker: v.toUpperCase() })}
                        placeholder="SWDA"
                        ariaLabel={`Ticker for product ${i + 1}`}
                        className="font-semibold"
                      />
                    </div>
                    <div>
                      <label className="label">Name</label>
                      <TextField
                        value={p.name}
                        onChange={(v) => update(p.id, { name: v })}
                        placeholder="iShares Core MSCI World"
                        ariaLabel={`Name for ${p.ticker || `product ${i + 1}`}`}
                      />
                    </div>
                    <div>
                      <label className="label">Currency</label>
                      <TextField
                        value={p.currency}
                        onChange={(v) => update(p.id, { currency: v.toUpperCase().slice(0, 5) })}
                        ariaLabel={`Currency for ${p.ticker || `product ${i + 1}`}`}
                        className="text-center uppercase"
                      />
                    </div>
                    <div>
                      <label className="label">Price per share</label>
                      <NumberField
                        value={p.unitPrice}
                        onChange={(v) => update(p.id, { unitPrice: v })}
                        min={0}
                        suffix={p.currency}
                        ariaLabel={`Price per share of ${p.ticker || `product ${i + 1}`}`}
                      />
                    </div>
                    <div>
                      <label className="label">Shares held</label>
                      <NumberField
                        value={p.shares}
                        onChange={(v) => update(p.id, { shares: v })}
                        min={0}
                        ariaLabel={`Shares held of ${p.ticker || `product ${i + 1}`}`}
                      />
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-danger mt-5 !px-2"
                    onClick={() => remove(p)}
                    title={`Remove ${p.ticker || 'product'}`}
                    aria-label={`Remove ${p.ticker || `product ${i + 1}`}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-4 text-xs text-[var(--ink-3)]">
                  <span>
                    Worth today{' '}
                    <strong className="num font-semibold text-[var(--ink-2)]">
                      {r ? formatMoney(r.valueBase, base) : '—'}
                    </strong>
                  </span>
                  {p.currency !== base && r && (
                    <span className="num">
                      1 {p.currency} = {formatMoney(settings.fxRates[p.currency] ?? 1, base, 4)}
                    </span>
                  )}
                  <label className="flex items-center gap-1.5">
                    Trading fee
                    <span className="w-24">
                      <NumberField
                        value={p.fee}
                        onChange={(v) => update(p.id, { fee: v })}
                        min={0}
                        suffix={base}
                        ariaLabel={`Trading fee for ${p.ticker || `product ${i + 1}`}`}
                        className="!py-0.5 !text-xs"
                      />
                    </span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className="mt-3 w-full rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-strong)] px-4 py-4 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          onClick={() => setAdding(true)}
        >
          + Add a product
        </button>

        <AddProductDialog
          open={adding}
          onClose={() => setAdding(false)}
          onAdd={(position) => onChange([...positions, position])}
          baseCurrency={base}
          defaultFee={positions.length > 0 ? positions[positions.length - 1].fee : 0}
          suggestedWeight={unallocated}
        />
      </div>

      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel="Set the split"
        nextDisabled={positions.length === 0 || incomplete.length > 0}
        nextHint={
          positions.length === 0
            ? 'Add at least one product'
            : incomplete.length > 0
              ? `${incomplete.length} product${incomplete.length === 1 ? ' needs' : 's need'} a ticker and a price`
              : undefined
        }
      />
    </div>
  );
}
