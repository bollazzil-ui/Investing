import type { Portfolio } from '../types';

/**
 * The portfolio from the original "Aufteilungsrechner.xlsx", used as the
 * starting point on first run.
 *
 * The sheet's target weights came from two knobs: a 14% small-cap share and a
 * 70/30 developed-to-emerging split, giving
 *   EIMI 30%, SWDA 0.7 − (0.99 × 0.14 × 0.7) = 60.298%, IUSN 9.702%.
 * Here they are plain editable numbers.
 */
export const SAMPLE_PORTFOLIO: Portfolio = {
  version: 1,
  name: 'Aufteilungsrechner',
  settings: {
    baseCurrency: 'CHF',
    cash: 290.4,
    fxRates: { USD: 0.8505, EUR: 0.9315 },
    rounding: 'truncate',
    allowSell: true,
    feeMode: 'all',
    allowFractionalShares: false,
    useLeftoverCash: true,
  },
  positions: [
    {
      id: 'p_eimi',
      ticker: 'EIMI',
      name: 'iShares Core MSCI EM IMI',
      isin: 'IE00BKM4GZ66',
      currency: 'USD',
      unitPrice: 31.25,
      shares: 516,
      targetWeight: 0.3,
      fee: 20,
      quoteSymbol: 'eimi.uk',
    },
    {
      id: 'p_swda',
      ticker: 'SWDA',
      name: 'iShares Core MSCI World',
      isin: 'IE00B4L5Y983',
      currency: 'USD',
      unitPrice: 89.84,
      shares: 357,
      targetWeight: 0.60298,
      fee: 20,
      quoteSymbol: 'swda.uk',
    },
    {
      id: 'p_iusn',
      ticker: 'IUSN',
      name: 'iShares MSCI World Small Cap',
      isin: 'IE00BF4RFH31',
      currency: 'EUR',
      unitPrice: 6.324,
      shares: 754,
      targetWeight: 0.09702,
      fee: 38,
      quoteSymbol: 'iusn.de',
    },
  ],
};
