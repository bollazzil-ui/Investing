import type { Portfolio } from '../types';
import { SAMPLE_PORTFOLIO } from './sample';

const KEY = 'aufteilungsrechner.portfolio.v1';
const THEME_KEY = 'aufteilungsrechner.theme';

export type Theme = 'light' | 'dark';

/**
 * Fills in anything a stored or imported portfolio is missing, so an older or
 * hand-edited file never crashes the app.
 */
export function hydrate(raw: unknown): Portfolio {
  const input = (raw ?? {}) as Partial<Portfolio> & { settings?: { cash?: unknown } };
  const s = (input.settings ?? {}) as Partial<Portfolio['settings']> & { cash?: unknown };
  const positions = Array.isArray(input.positions) ? input.positions : [];
  const baseCurrency = (s.baseCurrency || 'CHF').toUpperCase();

  // v1 → v2: a single `cash` number becomes a base-currency balance. Fees keep
  // their numbers and are simply re-read as the position's own currency, which
  // is what a v1 file most likely meant for a single-currency portfolio.
  const balances = sanitizeBalances(s.cashBalances);
  if (Object.keys(balances).length === 0 && num(s.cash, 0) > 0) {
    balances[baseCurrency] = num(s.cash, 0);
  }

  return {
    version: 2,
    name: typeof input.name === 'string' && input.name ? input.name : 'Portfolio',
    settings: {
      baseCurrency,
      cashBalances: balances,
      fxRates: sanitizeRates(s.fxRates),
      rounding:
        s.rounding === 'floor' || s.rounding === 'nearest' ? s.rounding : 'truncate',
      allowSell: s.allowSell ?? true,
      feeMode: s.feeMode === 'traded' ? 'traded' : 'all',
      allowFractionalShares: s.allowFractionalShares ?? false,
      useLeftoverCash: s.useLeftoverCash ?? true,
      conversionSpread: num(s.conversionSpread, 0.0025),
      conversionFee: num(s.conversionFee, 0),
    },
    positions: positions.map((p, i) => ({
      id: typeof p?.id === 'string' && p.id ? p.id : `p_${i}_${Math.random().toString(36).slice(2, 8)}`,
      ticker: String(p?.ticker ?? ''),
      name: String(p?.name ?? ''),
      isin: p?.isin ? String(p.isin) : undefined,
      currency: String(p?.currency || s.baseCurrency || 'CHF'),
      unitPrice: num(p?.unitPrice, 0),
      shares: num(p?.shares, 0),
      targetWeight: num(p?.targetWeight, 0),
      fee: num(p?.fee, 0),
      quoteSymbol: p?.quoteSymbol ? String(p.quoteSymbol) : undefined,
      locked: Boolean(p?.locked),
    })),
  };
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/** Cash balances: uppercase codes, finite non-negative amounts. */
function sanitizeBalances(balances: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (balances && typeof balances === 'object') {
    for (const [k, v] of Object.entries(balances as Record<string, unknown>)) {
      const n = num(v, NaN);
      if (Number.isFinite(n) && n >= 0) out[k.toUpperCase()] = n;
    }
  }
  return out;
}

function sanitizeRates(rates: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (rates && typeof rates === 'object') {
    for (const [k, v] of Object.entries(rates as Record<string, unknown>)) {
      const n = num(v, NaN);
      if (Number.isFinite(n) && n > 0) out[k.toUpperCase()] = n;
    }
  }
  return out;
}

export function loadPortfolio(): Portfolio {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SAMPLE_PORTFOLIO;
    return hydrate(JSON.parse(raw));
  } catch {
    // Private browsing, blocked site data, or corrupt JSON — start fresh.
    return SAMPLE_PORTFOLIO;
  }
}

export function savePortfolio(portfolio: Portfolio): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(portfolio));
  } catch {
    /* storage unavailable; the app still works for this session */
  }
}

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const MODE_KEY = 'aufteilungsrechner.mode';

export type ViewMode = 'guided' | 'advanced';

export function loadMode(): ViewMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'guided';
  } catch {
    return 'guided';
  }
}

export function saveMode(mode: ViewMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
