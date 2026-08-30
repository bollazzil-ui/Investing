import { describe, expect, it, vi } from 'vitest';
import {
  OPENFIGI_PROXY_URL,
  OPENFIGI_URL,
  lookupInstrument,
  parseFigiResponse,
  pickBestMatch,
  quoteCandidates,
  titleCase,
  type FetchLike,
} from './lookup';

/**
 * A recorded OpenFIGI /v3/mapping response for IE00B4L5Y983. One ISIN maps to
 * every venue the instrument lists on, which is the case the picker exists for.
 */
const FIGI_SWDA = [
  {
    data: [
      { figi: 'BBG00BLM3M27', name: 'ISHARES CORE MSCI WORLD', ticker: 'SWDA', exchCode: 'LN', securityType: 'ETP', marketSector: 'Equity', securityType2: 'Mutual Fund' },
      { figi: 'BBG00BLM3M36', name: 'ISHARES CORE MSCI WORLD', ticker: 'EUNL', exchCode: 'GY', securityType: 'ETP', marketSector: 'Equity', securityType2: 'Mutual Fund' },
      { figi: 'BBG00BLM3M45', name: 'ISHARES CORE MSCI WORLD', ticker: 'IWDA', exchCode: 'NA', securityType: 'ETP', marketSector: 'Equity', securityType2: 'Mutual Fund' },
      { figi: 'BBG00BLM3M54', name: 'ISHARES CORE MSCI WORLD', ticker: 'SWDA', exchCode: 'SW', securityType: 'ETP', marketSector: 'Equity', securityType2: 'Mutual Fund' },
    ],
  },
];

const FIGI_NO_MATCH = [{ warning: 'No identifier found.' }];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('parseFigiResponse', () => {
  it('reads the listings out of a mapping response', () => {
    const matches = parseFigiResponse(FIGI_SWDA);
    expect(matches).toHaveLength(4);
    expect(matches[0]).toMatchObject({ ticker: 'SWDA', name: 'ISHARES CORE MSCI WORLD', exchCode: 'LN' });
  });

  it('returns nothing for a no-match warning', () => {
    expect(parseFigiResponse(FIGI_NO_MATCH)).toEqual([]);
  });

  it('survives shapes it does not recognise', () => {
    for (const junk of [null, undefined, {}, [], [{}], [{ data: 'nope' }], 'text', [{ data: [null, 3] }]]) {
      expect(() => parseFigiResponse(junk)).not.toThrow();
      expect(Array.isArray(parseFigiResponse(junk))).toBe(true);
    }
  });
});

describe('pickBestMatch', () => {
  it('prefers a venue that can be priced and has one currency', () => {
    // Xetra (GY) is priceable via Stooq and is EUR-only; London lists in several.
    expect(pickBestMatch(parseFigiResponse(FIGI_SWDA))?.exchCode).toBe('GY');
  });

  it('honours an explicit exchange preference', () => {
    expect(pickBestMatch(parseFigiResponse(FIGI_SWDA), ['LN'])?.exchCode).toBe('LN');
  });

  it('ignores listings with no ticker', () => {
    expect(pickBestMatch([{ name: 'X' }, { ticker: 'Y', exchCode: 'UQ' }])?.ticker).toBe('Y');
  });

  it('returns undefined when there is nothing usable', () => {
    expect(pickBestMatch([])).toBeUndefined();
    expect(pickBestMatch([{ name: 'no ticker' }])).toBeUndefined();
  });
});

describe('quoteCandidates', () => {
  it('leads with the suffix implied by the exchange', () => {
    expect(quoteCandidates('EUNL', 'GY')[0]).toBe('eunl.de');
    expect(quoteCandidates('SWDA', 'LN')[0]).toBe('swda.uk');
  });

  it('keeps a suffix the user typed', () => {
    expect(quoteCandidates('vwrl.uk')).toContain('vwrl.uk');
  });

  it('falls back to common venues, without duplicates', () => {
    const c = quoteCandidates('SWDA');
    expect(c).toEqual([...new Set(c)]);
    expect(c).toContain('swda.uk');
    expect(c).toContain('swda.us');
  });

  it('returns nothing for an empty symbol', () => {
    expect(quoteCandidates('  ')).toEqual([]);
  });
});

describe('titleCase', () => {
  it('makes shouted provider names readable', () => {
    expect(titleCase('ISHARES CORE MSCI WORLD')).toBe('iShares Core MSCI World');
    expect(titleCase('VANGUARD FTSE ALL-WORLD UCITS ETF')).toBe('Vanguard Ftse All-world UCITS ETF');
  });

  it('leaves an already-cased name alone', () => {
    expect(titleCase('iShares Core MSCI World')).toBe('iShares Core MSCI World');
  });
});

describe('lookupInstrument', () => {
  const quoteOk = vi.fn(async (symbol: string) => {
    if (symbol === 'eunl.de') return { price: 89.84 };
    throw new Error('no data');
  });

  it('fills in ticker, name, currency and price from an ISIN', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(FIGI_SWDA);
    const r = await lookupInstrument('IE00B4L5Y983', { fetchImpl, quoteImpl: quoteOk });

    expect(r.isin).toBe('IE00B4L5Y983');
    expect(r.ticker).toBe('EUNL');
    expect(r.name).toBe('iShares Core MSCI World');
    expect(r.currency).toBe('EUR');
    expect(r.unitPrice).toBe(89.84);
    expect(r.quoteSymbol).toBe('eunl.de');
    expect(r.sources).toEqual({
      ticker: 'lookup',
      name: 'lookup',
      currency: 'guess', // derived from the exchange, never authoritative
      unitPrice: 'lookup',
    });
  });

  it('rejects a mistyped ISIN before making any request', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(
      lookupInstrument('IE00B4L5Y984', { fetchImpl, quoteImpl: quoteOk }),
    ).rejects.toThrow(/check digit/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still returns the identity when no price can be found', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(FIGI_SWDA);
    const r = await lookupInstrument('IE00B4L5Y983', {
      fetchImpl,
      quoteImpl: async () => {
        throw new Error('no data');
      },
    });
    expect(r.ticker).toBe('EUNL');
    expect(r.unitPrice).toBeUndefined();
    expect(r.sources.unitPrice).toBe('none');
    expect(r.notes.join(' ')).toMatch(/enter the price per share yourself/);
  });

  it('reports an unknown ISIN without throwing', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(FIGI_NO_MATCH);
    const r = await lookupInstrument('IE00B4L5Y983', {
      fetchImpl,
      quoteImpl: async () => {
        throw new Error('no data');
      },
    });
    expect(r.ticker).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/no listing for this ISIN/);
  });

  it('degrades to the typed symbol when the directory is unreachable', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    const r = await lookupInstrument('SWDA', { fetchImpl, quoteImpl: quoteOk });
    expect(r.ticker).toBe('SWDA');
    // Echoing the typed symbol is a convenience, not a lookup result.
    expect(r.sources.ticker).toBe('none');
    expect(r.sources.name).toBe('none');
    expect(r.notes.join(' ')).toMatch(/Could not reach the instrument directory/);
  });

  it('surfaces rate limiting in plain words', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({}, 429);
    const r = await lookupInstrument('IE00B4L5Y983', {
      fetchImpl,
      quoteImpl: async () => {
        throw new Error('no data');
      },
    });
    expect(r.notes.join(' ')).toMatch(/rate-limited/);
  });

  it('flags a multi-currency venue instead of guessing', async () => {
    // Only a London listing, which can be quoted in USD, GBP or EUR.
    const londonOnly = [{ data: [{ name: 'ISHARES CORE MSCI WORLD', ticker: 'SWDA', exchCode: 'LN' }] }];
    const r = await lookupInstrument('IE00B4L5Y983', {
      fetchImpl: async () => jsonResponse(londonOnly),
      quoteImpl: async () => ({ price: 76.4 }),
    });
    expect(r.currency).toBeUndefined();
    expect(r.sources.currency).toBe('none');
    expect(r.notes.join(' ')).toMatch(/more than one currency/);
  });

  it('retries through the same-origin proxy when the browser blocks the call', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      if (url === OPENFIGI_URL) throw new TypeError('Failed to fetch');
      return jsonResponse(FIGI_SWDA);
    };
    const r = await lookupInstrument('IE00B4L5Y983', { fetchImpl, quoteImpl: quoteOk });
    expect(seen).toEqual([OPENFIGI_URL, OPENFIGI_PROXY_URL]);
    expect(r.ticker).toBe('EUNL');
    expect(r.notes.join(' ')).not.toMatch(/Could not reach/);
  });

  it('does not retry a real HTTP error, which would fail the same way', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      return jsonResponse({}, 500);
    };
    const r = await lookupInstrument('IE00B4L5Y983', {
      fetchImpl,
      quoteImpl: async () => {
        throw new Error('no data');
      },
    });
    expect(seen).toEqual([OPENFIGI_URL]);
    expect(r.notes.join(' ')).toMatch(/returned 500/);
  });

  it('returns an empty result for an empty query without calling out', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const r = await lookupInstrument('   ', { fetchImpl });
    expect(r.ticker).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
