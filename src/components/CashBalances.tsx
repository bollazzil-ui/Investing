import { useState } from 'react';
import type { Settings } from '../types';
import { cashTotalBase, fxRate } from '../lib/calc';
import { formatMoney } from '../lib/format';
import { NumberField, TextField } from './primitives';

/**
 * Cash to invest, held per currency.
 *
 * The balances are one pooled budget — any of them can fund a purchase in any
 * currency — so the total in the base currency is what the plan actually
 * works from, and it is shown alongside.
 */
export function CashBalances({
  settings,
  onChange,
  compact,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  /** Denser layout, for the settings dialog. */
  compact?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const base = settings.baseCurrency.toUpperCase();
  const balances = settings.cashBalances ?? {};
  const codes = Object.keys(balances).sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const total = cashTotalBase(settings);

  function set(code: string, amount: number) {
    onChange({ ...settings, cashBalances: { ...balances, [code]: amount } });
  }

  function remove(code: string) {
    const next = { ...balances };
    delete next[code];
    onChange({ ...settings, cashBalances: next });
  }

  function add() {
    const code = newCode.trim().toUpperCase().slice(0, 5);
    if (!code || code in balances) {
      setAdding(false);
      setNewCode('');
      return;
    }
    onChange({ ...settings, cashBalances: { ...balances, [code]: 0 } });
    setAdding(false);
    setNewCode('');
  }

  return (
    <div>
      <div className="space-y-2">
        {codes.length === 0 && (
          <p className="text-xs text-[var(--ink-3)]">
            No cash added yet — add a balance to plan a purchase.
          </p>
        )}
        {codes.map((code) => (
          <div key={code} className="flex items-center gap-2">
            <span className="num w-12 shrink-0 text-xs font-semibold text-[var(--ink-2)]">{code}</span>
            <div className="min-w-0 flex-1">
              <NumberField
                value={balances[code]}
                onChange={(v) => set(code, v)}
                min={0}
                ariaLabel={`Cash available in ${code}`}
              />
            </div>
            {code !== base && (
              <span className="num w-24 shrink-0 text-right text-xs text-[var(--ink-3)]">
                ≈ {formatMoney(balances[code] * fxRate(settings, code), base, 0)}
              </span>
            )}
            <button
              className="btn btn-ghost btn-danger !px-1.5"
              onClick={() => remove(code)}
              title={`Remove the ${code} balance`}
              aria-label={`Remove the ${code} balance`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="w-24">
            <TextField
              value={newCode}
              onChange={setNewCode}
              placeholder="USD"
              ariaLabel="New cash currency"
              className="text-center uppercase"
            />
          </div>
          <button className="btn btn-primary !px-2.5 !py-1 text-xs" onClick={add}>
            Add
          </button>
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn mt-2 !px-2.5 !py-1 text-xs" onClick={() => setAdding(true)}>
          + Add a currency
        </button>
      )}

      {codes.length > 1 && (
        <p className={`${compact ? 'mt-2' : 'mt-3'} text-xs text-[var(--ink-2)]`}>
          Pooled budget{' '}
          <strong className="num font-semibold text-[var(--ink-1)]">
            {formatMoney(total, base)}
          </strong>
          <span className="block text-[0.6875rem] text-[var(--ink-3)]">
            Any balance can fund any purchase; buying in a currency you hold too little of costs
            the conversion charge set below.
          </span>
        </p>
      )}
    </div>
  );
}
