/**
 * Categorical colors are assigned by position index in fixed order and never
 * cycled: past eight positions everything folds into one neutral "other" slot,
 * which is honest about the fact that nine hues cannot be told apart.
 */
export const SERIES_SLOTS = 8;

export function seriesColor(index: number): string {
  return index < SERIES_SLOTS ? `var(--series-${index + 1})` : 'var(--series-other)';
}

/** True once a position falls outside the distinguishable color slots. */
export function isFoldedColor(index: number): boolean {
  return index >= SERIES_SLOTS;
}
