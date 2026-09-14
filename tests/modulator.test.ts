import { computeBarLevels, levelToSegments, litPairs, DEFAULT_TUNING, SEGMENTS } from '@/lib/audio/modulator';

const T = { ...DEFAULT_TUNING, smoothing: 0 };

describe('modulator level mapping', () => {
  it('returns silence for silence', () => {
    const l = computeBarLevels({ low: 0, mid: 0, high: 0 }, 0, T, null, 16);
    expect(l.left).toBe(0);
    expect(l.center).toBe(0);
    expect(l.right).toBe(0);
  });

  it('rises when audio energy rises', () => {
    let l = null;
    for (let i = 0; i < 60; i++) {
      l = computeBarLevels({ low: 0.3, mid: 0.5, high: 0.2 }, 0.4, T, l, 16);
    }
    expect(l!.center).toBeGreaterThan(0.5);
    expect(l!.center).toBeGreaterThanOrEqual(l!.left);
  });

  it('falls back toward silence when audio stops (release)', () => {
    let l = { left: 0.9, center: 1, right: 0.8 };
    for (let i = 0; i < 120; i++) {
      l = computeBarLevels({ low: 0, mid: 0, high: 0 }, 0, T, l, 16);
    }
    expect(l.center).toBeLessThan(0.05);
    expect(l.left).toBeLessThan(0.05);
  });

  it('releases faster with larger dt', () => {
    const a = computeBarLevels({ low: 0, mid: 0, high: 0 }, 0, T, { left: 0.9, center: 0.9, right: 0.9 }, 200);
    const b = computeBarLevels({ low: 0, mid: 0, high: 0 }, 0, T, { left: 0.9, center: 0.9, right: 0.9 }, 16);
    expect(a.center).toBeLessThan(b.center);
  });

  it('mirrors the outer bars and boosts the center bar', () => {
    let l = null;
    for (let i = 0; i < 90; i++) {
      // Deliberately asymmetric spectrum: outer columns must still match.
      l = computeBarLevels({ low: 0.05, mid: 0.5, high: 0.9 }, 0.45, T, l, 16);
    }
    expect(l!.left).toBe(l!.right);
    expect(l!.center).toBeGreaterThan(l!.left);
  });

  it('center bar is most prominent for speech-like input', () => {
    let l = null;
    for (let i = 0; i < 90; i++) {
      l = computeBarLevels({ low: 0.25, mid: 0.5, high: 0.15 }, 0.45, T, l, 16);
    }
    expect(l!.center).toBeGreaterThanOrEqual(l!.left);
    expect(l!.center).toBeGreaterThanOrEqual(l!.right);
  });

  it('microphone silence does not animate bars', () => {
    let l = { left: 0.5, center: 0.5, right: 0.5 };
    for (let i = 0; i < 90; i++) {
      l = computeBarLevels({ low: 0.001, mid: 0.001, high: 0.001 }, 0.001, T, l, 16);
    }
    expect(l.center).toBeLessThan(0.1);
  });

  it('levelToSegments expands from center outward', () => {
    expect(levelToSegments(0).every((s) => !s)).toBe(true);
    const full = levelToSegments(1);
    expect(full[0]).toBe(true);
    expect(full[SEGMENTS - 1]).toBe(true);
    const mid = levelToSegments(0.5);
    expect(mid[0]).toBe(true);
    expect(mid[SEGMENTS - 1]).toBe(false);
  });

  it('litPairs clamps', () => {
    expect(litPairs(-1)).toBe(0);
    expect(litPairs(0)).toBe(0);
    expect(litPairs(0.5)).toBe(Math.round(0.5 * SEGMENTS));
    expect(litPairs(2)).toBe(SEGMENTS);
  });
});