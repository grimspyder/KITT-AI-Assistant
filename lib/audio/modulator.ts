// Maps live audio analysis to the three-bar KITT voice modulator levels.
// Left bar: low band. Center: mid (strongest vocal energy). Right: high band.
// Bars expand symmetrically FROM CENTER — discrete segments light outward.

export interface BarLevels {
  left: number; // 0..1
  center: number;
  right: number;
}

export interface ModulatorTuning {
  attackMs: number; // rise speed
  releaseMs: number; // fall speed
  noiseFloor: number; // below this RMS, treat as silence
  minActivation: number; // minimum segment level when audio present
  gain: number; // input gain applied to band energies
  smoothing: number; // 0..1 extra exponential smoothing on top
}

export const DEFAULT_TUNING: ModulatorTuning = {
  attackMs: 25,
  releaseMs: 110,
  noiseFloor: 0.012,
  minActivation: 0.08,
  gain: 2.2,
  smoothing: 0.35,
};

export const SEGMENTS = 16; // LED segments per bar (research: 16-segment bargraph)

/**
 * Compute per-bar display levels from band energies.
 * Pure function — unit-testable. `prev` allows attack/release smoothing.
 */
export function computeBarLevels(
  bands: { low: number; mid: number; high: number },
  rms: number,
  tuning: ModulatorTuning,
  prev: BarLevels | null,
  dtMs: number,
): BarLevels {
  const floor = tuning.noiseFloor;
  const silent = rms < floor && bands.low < floor && bands.mid < floor && bands.high < floor;
  const g = tuning.gain;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  // target levels: mid band drives center (most prominent), side bars weighted
  const targets = {
    left: clamp01((bands.low * g - floor) * 1.35),
    center: clamp01(Math.max(bands.mid * g, rms * g * 1.1) - floor),
    right: clamp01((bands.high * g * 1.6 - floor) * 1.2),
  };
  if (silent) {
    targets.left = 0;
    targets.center = 0;
    targets.right = 0;
  } else {
    targets.center = Math.max(targets.center, tuning.minActivation);
    targets.left = Math.max(targets.left, tuning.minActivation * 0.7);
    targets.right = Math.max(targets.right, tuning.minActivation * 0.6);
  }

  const attack = tuning.attackMs / 1000;
  const release = tuning.releaseMs / 1000;

  const smooth = (cur: number, target: number): number => {
    const tau = target > cur ? attack : release;
    // exponential approach: moves `tau` fraction per... use per-ms coefficient
    const k = 1 - Math.exp(-dtMs / (tau * 1000 * 0.35));
    let v = cur + (target - cur) * k;
    if (tuning.smoothing > 0) {
      const s = 1 - tuning.smoothing * 0.7;
      v = v * s + target * (1 - s);
    }
    return clamp01(v);
  };

  const prevL = prev ?? { left: 0, center: 0, right: 0 };
  return {
    left: smooth(prevL.left, targets.left),
    center: smooth(prevL.center, targets.center),
    right: smooth(prevL.right, targets.right),
  };
}

/**
 * Convert a bar level (0..1) into a segment pattern expanding from center.
 * Returns array of length SEGMENTS: index 0 = center pair, higher = outward.
 * Values are segment intensities 0..1 (>=0.5 means lit).
 */
export function levelToSegments(level: number): boolean[] {
  const out: boolean[] = new Array(SEGMENTS).fill(false);
  const n = Math.round(level * SEGMENTS);
  for (let i = 0; i < n && i < SEGMENTS; i++) out[i] = true;
  // half-lit next segment for smoother perception
  return out;
}

/** How many segment-pairs should be lit for a level. */
export function litPairs(level: number): number {
  return Math.max(0, Math.min(SEGMENTS, Math.round(level * SEGMENTS)));
}