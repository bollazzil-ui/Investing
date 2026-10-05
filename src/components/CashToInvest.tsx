import { useMemo } from 'react';
import type { CalcResult, Portfolio, Settings } from '../types';
import { cashTotalBase, fxRate } from '../lib/calc';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { formatMoney } from '../lib/format';
import { NumberField, Section } from './primitives';

/**
 * The currencies this section shows a row for.
 *
 * Always the base currency, plus every currency the positions are priced in —
 * so adding a GBP position makes a GBP row appear on its own. A currency that
 * still holds cash keeps its row even after the last position using it is
 * removed, so no money is ever hidden.
 */
export function cashCurrencies(portfolio: Portfolio): string[] {
  const base = portfolio.settings.baseCurrency.toUpperCase();
  const fromPositions = portfolio.positions
    .map((p) => p.currency.toUpperCase())
    .filter(Boolean);
  const withBalance = Object.entries(portfolio.settings.cashBalances ?? {})
    .filter(([, amount]) => Number.isFinite(amount) && amount > 0)
    .map(([code]) => code.toUpperCase());

  const rest = [...new Set([...fromPositions, ...withBalance])]
    .filter((c) => c !== base)
    .sort();
  return [base, ...rest];
}

export function CashToInvest({
  portfolio,
  result,
  onChange,
  onRefreshFx,
  fxStatus,
}: {
  portfolio: Portfolio;
  result: CalcResult;
  onChange: (settings: Settings) => void;
  onRefreshFx: () => void;
  fxStatus: 'idle' | 'loading' | { asOf: string } | { error: string };
}) {
  const { settings } = portfolio;
  const base = settings.baseCurrency.toUpperCase();
  const codes = useMemo(() => cashCurrencies(portfolio), [portfolio]);
  const total = cashTotalBase(settings);

  /** Which positions put each currency on the list. */
  const usedBy = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of portfolio.positions) {
      const code = p.currency.toUpperCase();
      (map[code] ??= []).push(p.ticker || p.name || '—');
    }
    return map;
  }, [portfolio.positions]);

  const needsConversion = new Set(result.converted.map((c) => c.currency));

  function setBalance(code: string, amount: number) {
    onChange({
      ...settings,
      cashBalances: { ...settings.cashBalances, [code]: amount },
    });
  }

  function setRate(code: string, rate: number) {
    onChange({ ...settings, fxRates: { ...settings.fxRates, [code]: rate } });
  }

  const missingRates = codes.filter(
    (c) => c !== base && !(settings.fxRates[c] > 0),
  );

  return (
    <Section
      title="Cash to invest"
      description="Money you have available to invest, by currency. A row appears for the base currency and for every currency your positions are priced in."
      actions={
        <button
          className="btn"
          onClick={onRefreshFx}
          disabled={fxStatus === 'loading' || codes.length <= 1}
        >
          <RefreshCw
            size={15}
            className={fxStatus === 'loading' ? 'animate-spin' : undefined}
            aria-hidden
          />
          {fxStatus === 'loading' ? 'Fetching…' : 'Fetch rates'}
        </button>
      }
    >
      <div className="scroll-x">
        <table className="w-full border-collapse sm:min-w-[34rem]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="th th-left sticky-col">Currency</th>
              <th className="th sm:w-[11rem]">Available</th>
              <th className="th sm:w-[11rem]">1 unit = ? {base}</th>
              <th className="th w-[9rem] max-sm:hidden">Value in {base}</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => {
              const amount = settings.cashBalances?.[code] ?? 0;
              const rate = code === base ? 1 : (settings.fxRates[code] ?? 0);
              const valueBase = amount * fxRate(settings, code);
              const empty = !(amount > 0);
              return (
                <tr
                  key={code}
                  className="border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]/70"
                >
                  <td className="td td-left sticky-col !whitespace-normal">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="num font-semibold">{code}</span>
                      {needsConversion.has(code) && (
                        <span
                          className="chip"
                          style={{ background: 'var(--warning-soft)', color: 'var(--warning-ink)' }}
                          title={`The plan buys more ${code} than this balance holds, so part of it is converted.`}
                        >
                          <ArrowLeftRight size={11} strokeWidth={2.5} aria-hidden /> Converting
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--ink-3)]">
                      {code === base
                        ? 'Base currency'
                        : usedBy[code]
                          ? `For ${usedBy[code].join(', ')}`
                          : 'No position'}
                    </div>
                  </td>
                  <td className="td">
                    <NumberField
                      value={amount}
                      onChange={(v) => setBalance(code, v)}
                      min={0}
                      suffix={code}
                      inputId={`cash-amount-${code}`}
                      ariaLabel={`Cash available in ${code}`}
                    />
                    {code !== base && (
                      <div className="num mt-0.5 text-[0.6875rem] text-[var(--ink-3)] sm:hidden">
                        = {formatMoney(valueBase, base)}
                      </div>
                    )}
                  </td>
                  <td className="td">
                    {code === base ? (
                      <span className="num text-[var(--ink-3)]">1.0000</span>
                    ) : (
                      <NumberField
                        value={rate}
                        onChange={(v) => setRate(code, v)}
                        min={0}
                        suffix={base}
                        ariaLabel={`Exchange rate ${code} to ${base}`}
                        className={rate > 0 ? '' : 'field-invalid'}
                      />
                    )}
                  </td>
                  <td
                    className="td num font-medium max-sm:hidden"
                    style={{ color: empty ? 'var(--ink-3)' : undefined }}
                  >
                    {formatMoney(valueBase)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--surface-2)]">
              <td className="td td-left sticky-col font-semibold">Total</td>
              <td className="td td-left text-xs text-[var(--ink-3)] max-sm:hidden" colSpan={2}>
                Pooled — any balance can fund any purchase
              </td>
              <td className="td num font-semibold max-sm:text-left" colSpan={1}>
                {formatMoney(total, base)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--border)] px-4 py-3 text-xs sm:px-5">
        {missingRates.length > 0 && (
          <span style={{ color: 'var(--critical)' }}>
            No exchange rate for {missingRates.join(', ')} — enter one, or the values above are
            wrong.
          </span>
        )}
        {typeof fxStatus === 'object' && 'asOf' in fxStatus && (
          <span style={{ color: 'var(--good)' }}>ECB reference rates from {fxStatus.asOf}</span>
        )}
        {typeof fxStatus === 'object' && 'error' in fxStatus && (
          <span style={{ color: 'var(--critical)' }}>{fxStatus.error}</span>
        )}
        {result.conversionCost > 1e-6 && (
          <span className="text-[var(--ink-2)]">
            Includes{' '}
            <strong className="num font-semibold text-[var(--ink-1)]">
              {formatMoney(result.conversionCost, base)}
            </strong>{' '}
            of currency conversion for the currencies marked above.
          </span>
        )}
      </div>
    </Section>
  );
}
