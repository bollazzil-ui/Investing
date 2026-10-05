/**
 * Look-through exposure: what the portfolio actually owns, by continent,
 * country and currency.
 *
 * An index ETF holds hundreds of companies across many countries, and no free
 * provider this app can reach reports that breakdown. So each position is
 * matched to an *exposure profile* — the approximate country weights of the
 * index it tracks — and the profiles are blended by position value.
 *
 * The weights are rounded snapshots of each index (as of 2025) and drift as
 * markets move; they are good for "roughly how much is in Asia", not for
 * decimals. A position with no profile is reported as unclassified rather than
 * guessed.
 */
import type { Position } from '../types';

export type Continent =
  | 'North America'
  | 'Europe'
  | 'Asia'
  | 'Oceania'
  | 'South America'
  | 'Africa';

interface CountryInfo {
  name: string;
  continent: Continent;
  /** Currency of the country's listed companies. */
  currency: string;
}

export const COUNTRIES: Record<string, CountryInfo> = {
  US: { name: 'United States', continent: 'North America', currency: 'USD' },
  CA: { name: 'Canada', continent: 'North America', currency: 'CAD' },
  MX: { name: 'Mexico', continent: 'North America', currency: 'MXN' },
  BR: { name: 'Brazil', continent: 'South America', currency: 'BRL' },
  CL: { name: 'Chile', continent: 'South America', currency: 'CLP' },
  PE: { name: 'Peru', continent: 'South America', currency: 'PEN' },
  CO: { name: 'Colombia', continent: 'South America', currency: 'COP' },
  GB: { name: 'United Kingdom', continent: 'Europe', currency: 'GBP' },
  CH: { name: 'Switzerland', continent: 'Europe', currency: 'CHF' },
  FR: { name: 'France', continent: 'Europe', currency: 'EUR' },
  DE: { name: 'Germany', continent: 'Europe', currency: 'EUR' },
  NL: { name: 'Netherlands', continent: 'Europe', currency: 'EUR' },
  ES: { name: 'Spain', continent: 'Europe', currency: 'EUR' },
  IT: { name: 'Italy', continent: 'Europe', currency: 'EUR' },
  BE: { name: 'Belgium', continent: 'Europe', currency: 'EUR' },
  FI: { name: 'Finland', continent: 'Europe', currency: 'EUR' },
  IE: { name: 'Ireland', continent: 'Europe', currency: 'EUR' },
  AT: { name: 'Austria', continent: 'Europe', currency: 'EUR' },
  PT: { name: 'Portugal', continent: 'Europe', currency: 'EUR' },
  GR: { name: 'Greece', continent: 'Europe', currency: 'EUR' },
  SE: { name: 'Sweden', continent: 'Europe', currency: 'SEK' },
  DK: { name: 'Denmark', continent: 'Europe', currency: 'DKK' },
  NO: { name: 'Norway', continent: 'Europe', currency: 'NOK' },
  PL: { name: 'Poland', continent: 'Europe', currency: 'PLN' },
  HU: { name: 'Hungary', continent: 'Europe', currency: 'HUF' },
  CZ: { name: 'Czech Republic', continent: 'Europe', currency: 'CZK' },
  TR: { name: 'Turkey', continent: 'Europe', currency: 'TRY' },
  JP: { name: 'Japan', continent: 'Asia', currency: 'JPY' },
  CN: { name: 'China', continent: 'Asia', currency: 'CNY' },
  HK: { name: 'Hong Kong', continent: 'Asia', currency: 'HKD' },
  TW: { name: 'Taiwan', continent: 'Asia', currency: 'TWD' },
  IN: { name: 'India', continent: 'Asia', currency: 'INR' },
  KR: { name: 'South Korea', continent: 'Asia', currency: 'KRW' },
  SG: { name: 'Singapore', continent: 'Asia', currency: 'SGD' },
  ID: { name: 'Indonesia', continent: 'Asia', currency: 'IDR' },
  TH: { name: 'Thailand', continent: 'Asia', currency: 'THB' },
  MY: { name: 'Malaysia', continent: 'Asia', currency: 'MYR' },
  PH: { name: 'Philippines', continent: 'Asia', currency: 'PHP' },
  IL: { name: 'Israel', continent: 'Asia', currency: 'ILS' },
  SA: { name: 'Saudi Arabia', continent: 'Asia', currency: 'SAR' },
  AE: { name: 'United Arab Emirates', continent: 'Asia', currency: 'AED' },
  QA: { name: 'Qatar', continent: 'Asia', currency: 'QAR' },
  KW: { name: 'Kuwait', continent: 'Asia', currency: 'KWD' },
  ZA: { name: 'South Africa', continent: 'Africa', currency: 'ZAR' },
  EG: { name: 'Egypt', continent: 'Africa', currency: 'EGP' },
  AU: { name: 'Australia', continent: 'Oceania', currency: 'AUD' },
  NZ: { name: 'New Zealand', continent: 'Oceania', currency: 'NZD' },
};

export interface ExposureProfile {
  id: string;
  label: string;
  /** Country code → weight in percent. Normalised when used. */
  countries: Record<string, number>;
  /**
   * Set for a currency-hedged share class: the currency risk is swapped into
   * this currency, whatever the holdings' countries.
   */
  hedgedTo?: string;
}

const MSCI_WORLD: Record<string, number> = {
  US: 72, JP: 5.4, GB: 3.5, CA: 3.2, FR: 2.6, CH: 2.4, DE: 2.3, AU: 1.7, NL: 1.2,
  SE: 0.9, ES: 0.8, IT: 0.7, DK: 0.6, HK: 0.5, SG: 0.4, FI: 0.25, BE: 0.25,
  IL: 0.2, NO: 0.15, IE: 0.15, NZ: 0.05, AT: 0.05, PT: 0.05,
};

const MSCI_EM_IMI: Record<string, number> = {
  CN: 25, IN: 21, TW: 19, KR: 10, BR: 4.5, SA: 3.8, ZA: 3.2, MX: 2, TH: 1.6,
  ID: 1.5, MY: 1.5, AE: 1.3, PL: 0.9, TR: 0.8, QA: 0.8, KW: 0.8, PH: 0.6,
  CL: 0.5, GR: 0.5, PE: 0.2, HU: 0.2, CZ: 0.1, CO: 0.1, EG: 0.1,
};

const MSCI_WORLD_SMALL_CAP: Record<string, number> = {
  US: 60, JP: 11, GB: 4.5, CA: 3.5, AU: 3, SE: 1.8, CH: 1.5, DE: 1.5, FR: 1,
  IT: 1, IL: 0.8, ES: 0.7, NL: 0.6, NO: 0.6, SG: 0.5, DK: 0.5, HK: 0.4, BE: 0.4,
  FI: 0.3, AT: 0.3, NZ: 0.3, IE: 0.2, PT: 0.1,
};

const GLOBAL_AGG_BOND: Record<string, number> = {
  US: 42, JP: 10, CN: 9, FR: 5, DE: 5, GB: 4, IT: 4, CA: 3, ES: 2.5, AU: 1.5,
  KR: 1.2, NL: 1, BE: 1, AT: 0.5, FI: 0.3, DK: 0.3, SE: 0.3, CH: 0.3, NZ: 0.2,
  SG: 0.2, IE: 0.3, PT: 0.3,
};

function blend(parts: [Record<string, number>, number][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [weights, share] of parts) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [code, w] of Object.entries(weights)) {
      out[code] = (out[code] ?? 0) + (w / total) * share * 100;
    }
  }
  return out;
}

function without(weights: Record<string, number>, code: string): Record<string, number> {
  const out = { ...weights };
  delete out[code];
  return out;
}

export const PROFILES: ExposureProfile[] = [
  { id: 'msci-world', label: 'MSCI World', countries: MSCI_WORLD },
  { id: 'msci-world-ex-us', label: 'MSCI World ex USA', countries: without(MSCI_WORLD, 'US') },
  {
    id: 'msci-acwi',
    label: 'MSCI ACWI / FTSE All-World',
    countries: blend([
      [MSCI_WORLD, 0.895],
      [MSCI_EM_IMI, 0.105],
    ]),
  },
  { id: 'msci-em', label: 'MSCI Emerging Markets (IMI)', countries: MSCI_EM_IMI },
  { id: 'msci-world-small-cap', label: 'MSCI World Small Cap', countries: MSCI_WORLD_SMALL_CAP },
  { id: 'sp500', label: 'S&P 500 / US equities', countries: { US: 100 } },
  {
    id: 'europe',
    label: 'MSCI Europe',
    countries: { GB: 22, FR: 17, CH: 15, DE: 14, NL: 7, SE: 5.5, DK: 4, ES: 4.5, IT: 4.5, FI: 1.5, BE: 1.5, NO: 1, IE: 0.8, AT: 0.3, PT: 0.3 },
  },
  { id: 'switzerland', label: 'Swiss equities (SPI / SMI)', countries: { CH: 100 } },
  {
    id: 'global-agg-usd-hedged',
    label: 'Global Aggregate Bond (USD-hedged)',
    countries: GLOBAL_AGG_BOND,
    hedgedTo: 'USD',
  },
  {
    id: 'global-agg-chf-hedged',
    label: 'Global Aggregate Bond (CHF-hedged)',
    countries: GLOBAL_AGG_BOND,
    hedgedTo: 'CHF',
  },
];

const PROFILE_BY_ID = new Map(PROFILES.map((p) => [p.id, p]));

/** Well-known ETFs, by ISIN, mapped to the index they track. */
const BY_ISIN: Record<string, string> = {
  IE00B4L5Y983: 'msci-world', // iShares Core MSCI World (SWDA / IWDA / EUNL)
  IE00BJ0KDQ92: 'msci-world', // Xtrackers MSCI World
  IE00BFY0GT14: 'msci-world', // SPDR MSCI World
  IE00BKM4GZ66: 'msci-em', // iShares Core MSCI EM IMI (EIMI / EMIM)
  IE00BTJRMP35: 'msci-em', // Xtrackers MSCI Emerging Markets
  IE00BF4RFH31: 'msci-world-small-cap', // iShares MSCI World Small Cap (IUSN / WSML)
  IE00B3RBWM25: 'msci-acwi', // Vanguard FTSE All-World (VWRL)
  IE00BK5BQT80: 'msci-acwi', // Vanguard FTSE All-World Acc (VWCE / VWRA)
  IE00B6R52259: 'msci-acwi', // iShares MSCI ACWI (SSAC / IUSQ)
  IE00B5BMR087: 'sp500', // iShares Core S&P 500 (CSPX / SXR8)
  IE00B3XXRP09: 'sp500', // Vanguard S&P 500 (VUSA)
  IE00BFMXXD54: 'sp500', // Vanguard S&P 500 Acc (VUAA)
  IE00B4K48X80: 'europe', // iShares Core MSCI Europe (IMEU / SMEA)
  CH0237935652: 'switzerland', // iShares Core SPI (CHSPI)
  IE00BDBRDM35: 'global-agg-usd-hedged', // iShares Core Global Aggregate Bond USD Hedged (AGGH)
};

/** Fallback by ticker, for positions without an ISIN. */
const BY_TICKER: Record<string, string> = {
  SWDA: 'msci-world', IWDA: 'msci-world', EUNL: 'msci-world', XDWD: 'msci-world', URTH: 'msci-world',
  EIMI: 'msci-em', EMIM: 'msci-em', IS3N: 'msci-em',
  IUSN: 'msci-world-small-cap', WSML: 'msci-world-small-cap',
  VWRL: 'msci-acwi', VWCE: 'msci-acwi', VWRA: 'msci-acwi', SSAC: 'msci-acwi', IUSQ: 'msci-acwi', ACWI: 'msci-acwi',
  CSPX: 'sp500', SXR8: 'sp500', VUSA: 'sp500', VUAA: 'sp500', VOO: 'sp500', SPY: 'sp500', IVV: 'sp500', VTI: 'sp500',
  IMEU: 'europe', SMEA: 'europe',
  CHSPI: 'switzerland',
  AGGH: 'global-agg-usd-hedged',
};

/**
 * The profile a position is analysed with: the user's explicit choice, else a
 * match on ISIN, then on ticker. `undefined` means unclassified.
 */
export function profileFor(position: Position): ExposureProfile | undefined {
  // An id this version does not know (e.g. from an imported file) falls back
  // to detection instead of hiding the position as unclassified.
  const chosen = position.exposureProfile && PROFILE_BY_ID.get(position.exposureProfile);
  if (chosen) return chosen;
  const isin = position.isin?.trim().toUpperCase();
  const byIsin = isin ? BY_ISIN[isin] : undefined;
  if (byIsin) return PROFILE_BY_ID.get(byIsin);
  const ticker = position.ticker.trim().toUpperCase().replace(/\.[A-Z]{1,3}$/, '');
  const byTicker = BY_TICKER[ticker];
  return byTicker ? PROFILE_BY_ID.get(byTicker) : undefined;
}

export type Dimension = 'continent' | 'country' | 'currency';

export interface ExposureRow {
  key: string;
  label: string;
  /** Fraction of the analysed total, 0–1. */
  weight: number;
  /** Amount in the base currency. */
  value: number;
}

export interface ExposureBreakdown {
  rows: ExposureRow[];
  /** The part of the total that could not be classified. */
  unclassified: ExposureRow | null;
  /** Positions without a profile, by display name. */
  unclassifiedPositions: string[];
  total: number;
}

/**
 * Blends each position's profile by its amount in the base currency.
 *
 * `amounts` maps position id → amount (current value, or target value), so the
 * same function answers "what do I own" and "what am I aiming for".
 */
export function breakdown(
  positions: Position[],
  amounts: Record<string, number>,
  dimension: Dimension,
): ExposureBreakdown {
  const sums = new Map<string, { label: string; value: number }>();
  let unclassifiedValue = 0;
  const unclassifiedPositions: string[] = [];
  let total = 0;

  const add = (key: string, label: string, value: number) => {
    const entry = sums.get(key);
    if (entry) entry.value += value;
    else sums.set(key, { label, value });
  };

  for (const p of positions) {
    const amount = Math.max(0, amounts[p.id] ?? 0);
    if (amount === 0) continue;
    total += amount;
    const profile = profileFor(p);
    if (!profile) {
      unclassifiedValue += amount;
      unclassifiedPositions.push(p.ticker || p.name || 'Unnamed position');
      continue;
    }
    const weightSum = Object.values(profile.countries).reduce((a, b) => a + b, 0);
    for (const [code, w] of Object.entries(profile.countries)) {
      const info = COUNTRIES[code];
      if (!info) continue;
      const value = amount * (w / weightSum);
      if (dimension === 'country') add(code, info.name, value);
      else if (dimension === 'continent') add(info.continent, info.continent, value);
      else {
        const ccy = profile.hedgedTo ?? info.currency;
        add(ccy, ccy, value);
      }
    }
  }

  const rows = [...sums.entries()]
    .map(([key, { label, value }]) => ({ key, label, value, weight: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    rows,
    unclassified:
      unclassifiedValue > 0
        ? {
            key: 'unclassified',
            label: 'Unclassified',
            value: unclassifiedValue,
            weight: total > 0 ? unclassifiedValue / total : 0,
          }
        : null,
    unclassifiedPositions,
    total,
  };
}

/**
 * Keeps the `limit` largest rows and folds the rest into one "Other" row, so a
 * long tail of half-percent countries does not bury the ones that matter.
 */
export function foldTail(rows: ExposureRow[], limit: number, otherLabel: string): ExposureRow[] {
  if (rows.length <= limit + 1) return rows;
  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);
  return [
    ...head,
    {
      key: 'other',
      label: `${otherLabel} (${tail.length})`,
      value: tail.reduce((a, r) => a + r.value, 0),
      weight: tail.reduce((a, r) => a + r.weight, 0),
    },
  ];
}
