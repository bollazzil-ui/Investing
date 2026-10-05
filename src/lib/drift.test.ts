import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIFT_TOLERANCE, driftTolerance, driftTone } from './drift';

describe('driftTone', () => {
  it('treats anything inside the band as on target', () => {
    expect(driftTone(0.0001, 0.005)).toBe('ok');
    expect(driftTone(-0.005, 0.005)).toBe('ok');
  });

  it('flags the direction outside the band', () => {
    expect(driftTone(0.0051, 0.005)).toBe('over');
    expect(driftTone(-0.02, 0.005)).toBe('under');
  });

  it('flags any non-zero drift with a zero tolerance', () => {
    expect(driftTone(0.0001, 0)).toBe('over');
    expect(driftTone(0, 0)).toBe('ok');
  });
});

describe('driftTolerance', () => {
  it('falls back to the default for missing or invalid values', () => {
    expect(driftTolerance({})).toBe(DEFAULT_DRIFT_TOLERANCE);
    expect(driftTolerance({ driftTolerance: -1 })).toBe(DEFAULT_DRIFT_TOLERANCE);
    expect(driftTolerance({ driftTolerance: 0.01 })).toBe(0.01);
  });
});
