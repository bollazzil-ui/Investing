import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Portfolio, Position, Settings } from './types';
import { calculate } from './lib/calc';
import {
  downloadFile,
  hydrate,
  loadMode,
  loadPortfolio,
  loadTheme,
  saveMode,
  savePortfolio,
  saveTheme,
  type Theme,
} from './lib/storage';
import { portfolioJson, timestampedName, tradePlanCsv } from './lib/exporters';
import { fetchFxRates, fetchQuote } from './lib/quotes';
import { SAMPLE_PORTFOLIO } from './lib/sample';
import { SummaryTiles } from './components/SummaryTiles';
import { PositionsTable } from './components/PositionsTable';
import { SettingsPanel } from './components/SettingsPanel';
import { AllocationChart } from './components/AllocationChart';
import { TradePlan } from './components/TradePlan';
import { TextField } from './components/primitives';
import { GuidedFlow } from './components/GuidedFlow';
import { BuyDialog } from './components/BuyDialog';

type FxStatus = 'idle' | 'loading' | { asOf: string } | { error: string };
type QuoteStatus = Record<string, 'loading' | 'ok' | { error: string } | undefined>;

export default function App() {
  const [portfolio, setPortfolio] = useState<Portfolio>(loadPortfolio);
  const [mode, setMode] = useState<'guided' | 'advanced'>(loadMode);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [fxStatus, setFxStatus] = useState<FxStatus>('idle');
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>({});
  const [toast, setToast] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    savePortfolio(portfolio);
  }, [portfolio]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveMode(mode);
  }, [mode]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const result = useMemo(() => calculate(portfolio), [portfolio]);

  const setPositions = useCallback((positions: Position[]) => {
    setPortfolio((p) => ({ ...p, positions }));
  }, []);

  const setSettings = useCallback((settings: Settings) => {
    setPortfolio((p) => ({ ...p, settings }));
  }, []);

  const refreshFx = useCallback(async () => {
    const codes = [
      ...new Set(
        portfolio.positions
          .map((p) => p.currency.toUpperCase())
          .filter((c) => c && c !== portfolio.settings.baseCurrency.toUpperCase()),
      ),
    ];
    if (codes.length === 0) return;
    setFxStatus('loading');
    try {
      const { rates, asOf } = await fetchFxRates(portfolio.settings.baseCurrency, codes);
      setPortfolio((p) => ({
        ...p,
        settings: { ...p.settings, fxRates: { ...p.settings.fxRates, ...rates } },
      }));
      setFxStatus({ asOf });
    } catch (e) {
      setFxStatus({ error: message(e) });
    }
  }, [portfolio.positions, portfolio.settings.baseCurrency]);

  const refreshQuote = useCallback(
    async (id: string) => {
      const position = portfolio.positions.find((p) => p.id === id);
      if (!position?.quoteSymbol) return;
      setQuoteStatus((s) => ({ ...s, [id]: 'loading' }));
      try {
        const quote = await fetchQuote(position.quoteSymbol);
        setPortfolio((p) => ({
          ...p,
          positions: p.positions.map((x) => (x.id === id ? { ...x, unitPrice: quote.price } : x)),
        }));
        setQuoteStatus((s) => ({ ...s, [id]: 'ok' }));
      } catch (e) {
        setQuoteStatus((s) => ({
          ...s,
          [id]: {
            error: isNetworkError(e)
              ? 'Quote service unreachable — it needs the dev server or a proxy (see README).'
              : message(e),
          },
        }));
      }
    },
    [portfolio.positions],
  );

  function exportJson() {
    downloadFile(
      timestampedName('portfolio', 'json'),
      portfolioJson(portfolio),
      'application/json',
    );
    setToast('Portfolio exported as JSON.');
  }

  function exportCsv() {
    downloadFile(
      timestampedName('trade-plan', 'csv'),
      tradePlanCsv(portfolio, result),
      'text/csv;charset=utf-8',
    );
    setToast('Trade plan exported as CSV.');
  }

  async function importJson(file: File) {
    try {
      const next = hydrate(JSON.parse(await file.text()));
      setPortfolio(next);
      setToast(`Imported “${next.name}” with ${next.positions.length} position(s).`);
    } catch {
      setToast('That file is not a valid portfolio export.');
    }
  }

  function resetToSample() {
    if (!confirm('Replace the current portfolio with the original spreadsheet example? This cannot be undone.')) return;
    setPortfolio(SAMPLE_PORTFOLIO);
    setToast('Reset to the spreadsheet example.');
  }

  const showAfter = result.positions.some((p) => p.tradeShares !== 0);

  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--page)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-md)] text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--accent-hi), var(--accent-lo))',
                color: 'var(--accent-ink)',
                boxShadow: 'var(--shadow-accent)',
              }}
              aria-hidden
            >
              A
            </span>
            <div className="min-w-0">
              <div className="w-52 sm:w-64">
                <TextField
                  value={portfolio.name}
                  onChange={(v) => setPortfolio((p) => ({ ...p, name: v }))}
                  ariaLabel="Portfolio name"
                  className="!border-transparent !bg-transparent !px-1 !shadow-none text-base font-semibold tracking-[-0.015em]"
                />
              </div>
              <p className="px-1 text-[0.6875rem] font-medium text-[var(--ink-3)]">
                Allocation &amp; rebalancing calculator
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = '';
              }}
            />
            <button className="btn btn-primary" onClick={() => setBuying(true)}>
              Buy shares
            </button>
            <div
              role="radiogroup"
              aria-label="View mode"
              className="mr-1 inline-flex rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-1"
            >
              {(['guided', 'advanced'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className="rounded-[0.4rem] px-2.5 py-1 text-xs font-[550] capitalize transition-all duration-150"
                  style={{
                    background: mode === m ? 'var(--surface-1)' : 'transparent',
                    color: mode === m ? 'var(--ink-1)' : 'var(--ink-3)',
                    boxShadow: mode === m ? 'var(--shadow-card)' : 'none',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              ↑ Import
            </button>
            <button className="btn" onClick={exportJson}>
              ↓ Export
            </button>
            <button className="btn" onClick={resetToSample} title="Load the original spreadsheet example">
              Reset
            </button>
            <button
              className="btn !px-2"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto space-y-4 px-4 py-5 sm:px-6 ${
          mode === 'guided' ? 'max-w-5xl' : 'max-w-[100rem]'
        }`}
      >
        {mode === 'guided' ? (
          <GuidedFlow
            portfolio={portfolio}
            result={result}
            onPositions={setPositions}
            onSettings={setSettings}
            onExportCsv={exportCsv}
            onAdvanced={() => setMode('advanced')}
            onBuy={() => setBuying(true)}
          />
        ) : (
          <>
        <SummaryTiles result={result} currency={portfolio.settings.baseCurrency} />

        {result.warnings.length > 0 && (
          <div
            role="status"
            className="card border-l-[3px] px-4 py-3.5"
            style={{ borderLeftColor: 'var(--warning)', background: 'var(--warning-soft)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">
              ⚠ Check these
            </p>
            <ul className="mt-1 space-y-1 text-sm text-[var(--ink-1)]">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <PositionsTable
              portfolio={portfolio}
              result={result}
              onChange={setPositions}
              onRefreshQuote={refreshQuote}
              quoteStatus={quoteStatus}
            />
            <AllocationChart
              result={result}
              currency={portfolio.settings.baseCurrency}
              showAfter={showAfter}
            />
          </div>
          <div className="min-w-0">
            <div className="xl:sticky xl:top-[4.5rem]">
              <SettingsPanel
                portfolio={portfolio}
                onChange={setSettings}
                onRefreshFx={refreshFx}
                fxStatus={fxStatus}
              />
            </div>
          </div>
        </div>

        <TradePlan
          result={result}
          currency={portfolio.settings.baseCurrency}
          onExportCsv={exportCsv}
          onBuy={() => setBuying(true)}
        />
          </>
        )}

        <BuyDialog
          open={buying}
          portfolio={portfolio}
          onClose={() => setBuying(false)}
          onSave={(next) => {
            setPortfolio(next);
            setToast('Purchase saved — your holdings and cash are updated.');
          }}
        />

        <footer className="pb-8 pt-3 text-center text-xs text-[var(--ink-3)]">
          Saved in this browser only. Figures are an aid for your own decisions, not investment
          advice.
        </footer>
      </main>

      {toast && (
        <div
          role="status"
          className="card fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 text-sm"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}
