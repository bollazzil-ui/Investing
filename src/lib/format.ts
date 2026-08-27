const LOCALE = 'de-CH';

export function formatMoney(value: number, currency?: string, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const n = value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return currency ? `${n} ${currency}` : n;
}

export function formatPercent(fraction: number, decimals = 2): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** Percentages with an explicit sign, for drift figures. */
export function formatSignedPercent(fraction: number, decimals = 2): string {
  if (!Number.isFinite(fraction)) return '—';
  const sign = fraction > 0 ? '+' : '';
  return sign + formatPercent(fraction, decimals);
}

export function formatSignedMoney(value: number, currency?: string, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + formatMoney(value, currency, decimals);
}

export function formatShares(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const decimals = Number.isInteger(value) ? 0 : 4;
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parses numbers the way a European spreadsheet user types them:
 * "1'234.56", "1.234,56" and "1234,56" all work.
 */
export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[\s'’]/g, '').replace(/[^\d.,+-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal separator.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = cleaned.replace(',', '.');
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function uid(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
