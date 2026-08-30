import { describe, expect, it } from 'vitest';
import { isValidIsin, isinCountry, looksLikeIsin, looksLikeTicker, normalizeIsin } from './isin';

describe('isValidIsin', () => {
  it('accepts real ISINs', () => {
    for (const isin of [
      'IE00B4L5Y983', // iShares Core MSCI World
      'IE00BKM4GZ66', // iShares Core MSCI EM IMI
      'IE00BF4RFH31', // iShares MSCI World Small Cap
      'IE00B3RBWM25', // Vanguard FTSE All-World
      'US0378331005', // Apple
      'US5949181045', // Microsoft
      'DE0007164600', // SAP
      'GB0002634946', // BAE Systems
      'CH0038863350', // Nestle
      'FR0000120271', // TotalEnergies
    ]) {
      expect(isValidIsin(isin), isin).toBe(true);
    }
  });

  it('rejects a wrong check digit', () => {
    expect(isValidIsin('IE00B4L5Y984')).toBe(false);
    expect(isValidIsin('US0378331006')).toBe(false);
  });

  it('rejects transposed characters', () => {
    expect(isValidIsin('IE00B4L5Y938')).toBe(false);
  });

  it('rejects the wrong shape', () => {
    for (const bad of ['', 'SWDA', 'IE00B4L5Y98', 'IE00B4L5Y9833', '1E00B4L5Y983', 'IE00B4L5Y98X']) {
      expect(isValidIsin(bad), bad).toBe(false);
    }
  });

  it('tolerates spacing and punctuation', () => {
    expect(isValidIsin('ie00 b4l5 y983')).toBe(true);
    expect(isValidIsin('IE00-B4L5-Y983')).toBe(true);
  });
});

describe('normalizeIsin', () => {
  it('uppercases and strips separators', () => {
    expect(normalizeIsin(' ie00-b4l5 y983 ')).toBe('IE00B4L5Y983');
  });
});

describe('looksLikeIsin', () => {
  it('matches the shape without checking the digit', () => {
    expect(looksLikeIsin('IE00B4L5Y984')).toBe(true);
    expect(looksLikeIsin('SWDA')).toBe(false);
  });
});

describe('isinCountry', () => {
  it('returns the prefix for an ISIN and null otherwise', () => {
    expect(isinCountry('IE00B4L5Y983')).toBe('IE');
    expect(isinCountry('SWDA')).toBe(null);
  });
});

describe('looksLikeTicker', () => {
  it('accepts plain and suffixed symbols', () => {
    for (const t of ['SWDA', 'AAPL', 'swda.uk', 'BRK-B', 'VWRL.L']) {
      expect(looksLikeTicker(t), t).toBe(true);
    }
  });

  it('rejects ISINs and free text', () => {
    expect(looksLikeTicker('IE00B4L5Y983')).toBe(false);
    expect(looksLikeTicker('iShares Core MSCI World')).toBe(false);
  });
});
