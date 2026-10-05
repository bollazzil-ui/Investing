import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileDown,
  Monitor,
  Moon,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  Sun,
  Upload,
} from 'lucide-react';
import type { Portfolio, Position, Settings } from './types';
import { calculate, normalizeWeights } from './lib/calc';
import { driftTolerance } from './lib/drift';
import { formatFreshness } from './lib/format';
import {
  downloadFile,
  hydrate,
  loadPortfolio,
  loadTheme,
  resolveTheme,
  savePortfolio,
  saveTheme,
  type Theme,
} from './lib/storage';
import { portfolioJson, timestampedName, tradePlanCsv } from './lib/exporters';
import { currencyMismatch, fetchFxRates, fetchQuote } from './lib/quotes';
import { SAMPLE_PORTFOLIO } from './lib/sample';
import { PositionsTable } from './components/PositionsTable';
import { SettingsDialog } from './components/SettingsDialog';
import { CashToInvest } from './components/CashToInvest';
import { TradePlan } from './components/TradePlan';
import { PlanNotices } from './components/PlanNotices';
import { Menu } from './components/Menu';
import { TextField } from './components/primitives';
import { RefreshDialog } from './components/RefreshDialog';
import { REFRESH_TIMEOUT_MS, applyRefresh, refreshAll, type RefreshReport } from './lib/refresh';

type FxStatus = 'idle' | 'loading' | { asOf: string } | { error: string };
type QuoteStatus = Record<string, 'loading' | 'ok' | { error: string } | undefined>;
type Toast = { text: string; action?: { label: string; run: () => void } };

export default function App() {
  const [portfolio, setPortfolio] = useState<Portfolio>(loadPortfolio);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [fxStatus, setFxStatus] = useState<FxStatus>('idle');
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>({});
  const [toast, setToastState] = useState<Toast | null>(null);
  const [dismissedNotices, setDismissedNotices] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshReport, setRefreshReport] = useState<RefreshReport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    savePortfolio(portfolio);
  }, [portfolio]);

  useEffect(() => {
    saveTheme(theme);
    const apply = () =>
      document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
    apply();
    if (theme !== 'system') return;
    // Follow the OS while on "System".
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    } catch {
      return;
    }
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    // A toast with an Undo stays long enough to reach for it.
    const t = setTimeout(() => setToastState(null), toast.action ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Keeps "updated 5 min ago" current without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const setToast = useCallback((text: string, action?: Toast['action']) => {
    setToastState({ text, action });
  }, []);

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
      const { rates, asOf, missing } = await fetchFxRates(portfolio.settings.baseCurrency, codes);
      setPortfolio((p) => ({
        ...p,
        settings: { ...p.settings, fxRates: { ...p.settings.fxRates, ...rates } },
      }));
      setFxStatus(
        missing.length > 0
          ? { error: `No rate available for ${missing.join(', ')} — enter it manually.` }
          : { asOf },
      );
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
        const mismatch = currencyMismatch(quote, position.currency);
        if (mismatch) throw new Error(mismatch);
        setPortfolio((p) => ({
          ...p,
          positions: p.positions.map((x) =>
            x.id === id ? { ...x, unitPrice: quote.price, quoteSymbol: quote.symbol } : x,
          ),
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

  /**
   * Re-fetches every exchange rate and share price at once. A clean run just
   * shows a toast; anything that did not update opens the report, which names
   * each currency or product and why, so it can be typed in by hand.
   */
  const refreshPrices = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const { updates, report } = await refreshAll(portfolio, {
        signal: controller.signal,
      });
      // Applied to the latest state, not the snapshot the refresh started
      // from, so edits made while it ran are kept.
      setPortfolio((current) => {
        const next = applyRefresh(current, updates);
        // Stamp the time only when every price came back, so the stamp never
        // vouches for a price that failed to update.
        return report.clean ? { ...next, pricesUpdatedAt: new Date().toISOString() } : next;
      });
      setNow(Date.now());
      if (report.clean) {
        setToast(
          report.updated > 0
            ? `Refreshed ${report.updated} value${report.updated === 1 ? '' : 's'}.`
            : 'Everything was already up to date.',
        );
      } else {
        setRefreshReport(report);
      }
    } catch (e) {
      // refreshAll resolves rather than rejects, so this is a genuine surprise.
      setToast(`Refresh failed: ${message(e)}`);
    } finally {
      clearTimeout(timer);
      setRefreshing(false);
    }
  }, [portfolio, refreshing, setToast]);

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

  /** Removes a position, with an Undo that puts it back where it was. */
  const removePosition = useCallback(
    (id: string) => {
      const at = portfolio.positions.findIndex((p) => p.id === id);
      if (at < 0) return;
      const removed = portfolio.positions[at];
      setPortfolio((p) => ({ ...p, positions: p.positions.filter((x) => x.id !== id) }));
      setToast(`Removed ${removed.ticker || removed.name || 'position'}.`, {
        label: 'Undo',
        run: () => {
          setPortfolio((p) => {
            if (p.positions.some((x) => x.id === id)) return p;
            const positions = [...p.positions];
            positions.splice(Math.min(at, positions.length), 0, removed);
            return { ...p, positions };
          });
          setToastState(null);
        },
      });
    },
    [portfolio.positions, setToast],
  );

  function focusCash(code: string) {
    const el = document.getElementById(`cash-amount-${code}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }

  function resetToSample() {
    if (!confirm('Replace the current portfolio with the example portfolio?')) return;
    const previous = portfolio;
    setPortfolio(SAMPLE_PORTFOLIO);
    setToast('Replaced with the example portfolio.', {
      label: 'Undo',
      run: () => {
        setPortfolio(previous);
        setToastState(null);
      },
    });
  }

  const base = portfolio.settings.baseCurrency;
  const freshness = formatFreshness(portfolio.pricesUpdatedAt, now);

  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--page)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[100rem] items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-md)] text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--accent-hi), var(--accent-lo))',
                color: 'var(--accent-ink)',
                boxShadow: 'var(--shadow-accent)',
              }}
              aria-hidden
            >
              R
            </span>
            <div className="min-w-0 flex-1">
              <div className="w-full max-w-64">
                <TextField
                  value={portfolio.name}
                  onChange={(v) => setPortfolio((p) => ({ ...p, name: v }))}
                  ariaLabel="Portfolio name"
                  className="!border-transparent !bg-transparent !px-1 !py-0.5 !shadow-none text-base font-semibold tracking-[-0.015em] hover:!border-[var(--border)]"
                />
              </div>
              <p className="truncate px-1 text-[0.6875rem] font-medium text-[var(--ink-3)]">
                Portfolio rebalancer
              </p>
            </div>
          </div>

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

          <div className="flex shrink-0 items-center gap-2">
            <span
              className="hidden text-right text-[0.6875rem] leading-tight text-[var(--ink-3)] md:block"
              title={
                portfolio.pricesUpdatedAt
                  ? `Prices last refreshed ${new Date(portfolio.pricesUpdatedAt).toLocaleString()}`
                  : undefined
              }
              style={{ color: freshness.stale ? 'var(--warning-ink)' : undefined }}
            >
              {freshness.label}
            </span>
            <button
              className="btn"
              onClick={() => void refreshPrices()}
              disabled={refreshing}
              title={`Fetch current exchange rates and share prices — ${freshness.label.toLowerCase()}`}
              aria-busy={refreshing}
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : undefined} aria-hidden />
              <span className="max-sm:sr-only">{refreshing ? 'Refreshing…' : 'Refresh prices'}</span>
            </button>
            <button
              className="btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Calculator settings"
            >
              <SettingsIcon size={15} aria-hidden />
              <span className="max-lg:sr-only">Settings</span>
            </button>
            <Menu
              ariaLabel="More"
              triggerClassName="btn !px-2"
              trigger={<MoreHorizontal size={17} aria-hidden />}
              entries={[
                { label: 'Import portfolio…', icon: Upload, onSelect: () => fileInput.current?.click() },
                { label: 'Export portfolio (JSON)', icon: Download, onSelect: exportJson },
                {
                  label: 'Export trade plan (CSV)',
                  icon: FileDown,
                  onSelect: exportCsv,
                  disabled: portfolio.positions.length === 0,
                },
                { kind: 'separator' },
                { kind: 'label', label: 'Theme' },
                { label: 'System', icon: Monitor, checked: theme === 'system', onSelect: () => setTheme('system') },
                { label: 'Light', icon: Sun, checked: theme === 'light', onSelect: () => setTheme('light') },
                { label: 'Dark', icon: Moon, checked: theme === 'dark', onSelect: () => setTheme('dark') },
                { kind: 'separator' },
                {
                  label: 'Replace with example…',
                  icon: RotateCcw,
                  danger: true,
                  onSelect: resetToSample,
                },
              ]}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[100rem] space-y-4 px-4 py-5 sm:px-6">
        <TradePlan
          result={result}
          currency={base}
          tolerance={driftTolerance(portfolio.settings)}
          onExportCsv={exportCsv}
          notices={
            <PlanNotices
              result={result}
              settings={portfolio.settings}
              dismissedKey={dismissedNotices}
              onDismiss={setDismissedNotices}
              onNormalise={() => setPositions(normalizeWeights(portfolio.positions))}
              onFocusCash={focusCash}
              onAllowSell={() => setSettings({ ...portfolio.settings, allowSell: true })}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          }
        />

        <PositionsTable
          portfolio={portfolio}
          result={result}
          onChange={setPositions}
          onRemove={removePosition}
          onRefreshQuote={refreshQuote}
          quoteStatus={quoteStatus}
        />
        <CashToInvest
          portfolio={portfolio}
          result={result}
          onChange={setSettings}
          onRefreshFx={refreshFx}
          fxStatus={fxStatus}
        />

        <SettingsDialog
          open={settingsOpen}
          portfolio={portfolio}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />

        <RefreshDialog
          report={refreshReport}
          baseCurrency={base}
          onClose={() => setRefreshReport(null)}
        />

        <footer className="pb-8 pt-3 text-center text-xs text-[var(--ink-3)]">
          Saved in this browser only. Figures are an aid for your own decisions, not investment
          advice.
        </footer>
      </main>

      {toast && (
        <div
          role="status"
          className="card no-print fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 py-2 pl-4 pr-2 text-sm"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          <span className="min-w-0">{toast.text}</span>
          {toast.action ? (
            <button className="btn !py-1 font-semibold text-[var(--accent)]" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          ) : (
            <span className="pr-2" />
          )}
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
