import { describe, expect, it } from 'vitest';
import { formatFreshness } from './format';

describe('formatFreshness', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');

  it('asks for a refresh when there is no stamp', () => {
    expect(formatFreshness(undefined, now)).toEqual({ label: 'Prices not refreshed yet', stale: true });
    expect(formatFreshness('garbage', now).stale).toBe(true);
  });

  it('counts minutes within the hour', () => {
    expect(formatFreshness('2026-10-05T11:59:40Z', now).label).toBe('Prices updated just now');
    expect(formatFreshness('2026-10-05T11:35:00Z', now).label).toBe('Prices updated 25 min ago');
  });

  it('flags prices older than a day as stale', () => {
    const r = formatFreshness('2026-10-02T12:00:00Z', now);
    expect(r.label).toBe('Prices from 3 days ago');
    expect(r.stale).toBe(true);
  });
});
