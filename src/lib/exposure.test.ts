import { describe, expect, it } from 'vitest';
import type { Position } from '../types';
import { COUNTRIES, PROFILES, breakdown, foldTail, profileFor } from './exposure';

const pos = (over: Partial<Position>): Position => ({
  id: 'a',
  ticker: '',
  name: '',
  currency: 'USD',
  unitPrice: 1,
  shares: 1,
  targetWeight: 0,
  fee: 0,
  ...over,
});

describe('profiles', () => {
  it('only use countries the app knows', () => {
    for (const p of PROFILES) {
      for (const code of Object.keys(p.countries)) expect(COUNTRIES[code], `${p.id}:${code}`).toBeDefined();
    }
  });
});

describe('profileFor', () => {
  it('recognises an ETF by ISIN, then by ticker', () => {
    expect(profileFor(pos({ isin: 'IE00B4L5Y983', ticker: 'XYZ' }))?.id).toBe('msci-world');
    expect(profileFor(pos({ ticker: 'EIMI' }))?.id).toBe('msci-em');
    expect(profileFor(pos({ ticker: 'IUSN.DE' }))?.id).toBe('msci-world-small-cap');
  });

  it('prefers an explicit choice and leaves unknowns unclassified', () => {
    expect(profileFor(pos({ ticker: 'SWDA', exposureProfile: 'sp500' }))?.id).toBe('sp500');
    expect(profileFor(pos({ ticker: 'WXUS' }))).toBeUndefined();
  });
});

describe('breakdown', () => {
  const positions = [
    pos({ id: 'us', ticker: 'CSPX' }), // 100% US
    pos({ id: 'ch', ticker: 'CHSPI' }), // 100% Switzerland
    pos({ id: 'x', ticker: 'MYSTERY' }),
  ];
  const amounts = { us: 600, ch: 300, x: 100 };

  it('blends profiles by amount and keeps the unknown part separate', () => {
    const b = breakdown(positions, amounts, 'country');
    expect(b.total).toBe(1000);
    expect(b.rows.map((r) => [r.key, r.weight])).toEqual([
      ['US', 0.6],
      ['CH', 0.3],
    ]);
    expect(b.unclassified?.weight).toBeCloseTo(0.1);
    expect(b.unclassifiedPositions).toEqual(['MYSTERY']);
  });

  it('rolls countries up into continents and currencies', () => {
    expect(breakdown(positions, amounts, 'continent').rows.map((r) => r.key)).toEqual([
      'North America',
      'Europe',
    ]);
    expect(breakdown(positions, amounts, 'currency').rows.map((r) => r.key)).toEqual(['USD', 'CHF']);
  });

  it('counts a hedged fund as its hedge currency', () => {
    const b = breakdown([pos({ id: 'b', ticker: 'AGGH' })], { b: 100 }, 'currency');
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0].key).toBe('USD');
    expect(b.rows[0].weight).toBeCloseTo(1, 9);
  });

  it('sums to the whole for a broad index', () => {
    const b = breakdown([pos({ id: 'w', ticker: 'VWRL' })], { w: 1 }, 'country');
    expect(b.rows.reduce((a, r) => a + r.weight, 0)).toBeCloseTo(1, 9);
  });
});

describe('foldTail', () => {
  it('folds everything past the limit into one row', () => {
    const rows = [5, 4, 3, 2, 1].map((v) => ({ key: String(v), label: String(v), value: v, weight: v / 15 }));
    const out = foldTail(rows, 2, 'Other');
    expect(out.map((r) => r.label)).toEqual(['5', '4', 'Other (3)']);
    expect(out[2].value).toBe(6);
  });
});

describe('profileFor with an unknown saved profile', () => {
  it('falls back to detection', () => {
    expect(profileFor(pos({ ticker: 'SWDA', exposureProfile: 'no-such-index' }))?.id).toBe('msci-world');
  });
});
