/**
 * VBT Velocity Zones — WA-owned velocity-zone thresholds.
 *
 * WA owns the VBT velocity-zone boundaries because they vary by exercise and by
 * the user's individual load-velocity (LV) profile; a single hardcoded absolute
 * scale is provably wrong for any lift far from a generic-compound curve.
 *
 * All bands are expressed in **MEAN concentric velocity** (m/s) semantics
 * (brain decision WA-D02): the canonical VBT zone charts, the load-velocity
 * relationship `predictVelocity` models, and WA's velocity-loss reference are
 * all mean-velocity quantities. Feed mean per-rep velocity (see
 * `getSetRepMeanVelocities`) into `categorizeVelocity`, never peak.
 *
 * This module returns numeric bands + zone identity + human label ONLY. Colors
 * stay in the UI/design system — WA is intentionally color-free.
 */

import type { LoadVelocityProfile } from '@/vbt/profile';
import { predictVelocity } from '@/vbt/profile';
import { DEFAULT_MVT } from '@/vbt/constants';

// =============================================================================
// Types
// =============================================================================

/** Stable identity of a velocity zone, ordered grinding (slow) → speed (fast). */
export type VelocityZoneId =
  | 'grinding'
  | 'maximalStrength'
  | 'strengthSpeed'
  | 'power'
  | 'speed';

/**
 * Legacy 4-way velocity zone union.
 *
 * @deprecated Superseded by the 5-zone {@link VelocityZoneId} taxonomy
 * (WA-02.04). Retained only so the public API stays a superset of prior
 * releases; `categorizeVelocity` now returns {@link VelocityZoneId}. Will be
 * removed in a future major.
 */
export type VelocityZone = 'fast' | 'moderate' | 'slow' | 'grinding';

/**
 * Coarse movement classification used to pick a fallback zone table when no
 * individual profile exists. `isolation` and `cable` share the constant-tension
 * (lower-velocity) table; `compound` is the generic free-weight default;
 * `ballistic` shifts up for higher-amplitude Olympic/jump work.
 */
export type MovementClass = 'ballistic' | 'compound' | 'isolation' | 'cable';

/** A single contiguous velocity band. `max === null` marks the open top band. */
export interface VelocityZoneBand {
  readonly id: VelocityZoneId;
  /** Human-readable label; NO color (color is a UI concern). */
  readonly label: string;
  /** Inclusive lower bound, m/s mean concentric velocity (0 for the lowest band). */
  readonly min: number;
  /** Exclusive upper bound, m/s (null = open top). */
  readonly max: number | null;
}

/** A fully-resolved zone set, tagged with how it was derived. */
export interface VelocityZones {
  /** Ordered ascending by velocity; contiguous; covers [0, ∞). */
  readonly bands: readonly VelocityZoneBand[];
  readonly source: 'profile' | 'movement-class-default' | 'global-default';
  readonly basis: {
    readonly mvt: number;
    /** profile.intercept (V0) when profile-derived. */
    readonly v0?: number;
    readonly estimated1RM?: number;
    readonly exerciseId?: string;
    readonly movementClass?: MovementClass;
  };
}

export interface GetVelocityZonesOptions {
  /** Preferred: an individualized LV profile. Used when confidence !== 'low'. */
  readonly profile?: LoadVelocityProfile;
  /** Fallback selector when no usable profile is supplied. */
  readonly movementClass?: MovementClass;
  /** Echoed into `basis` for the consumer. */
  readonly exerciseId?: string;
  /** MVT override; else profile.mvt, else DEFAULT_MVT. */
  readonly mvt?: number;
}

// =============================================================================
// Zone identities & labels
// =============================================================================

const ZONE_LABELS: Record<VelocityZoneId, string> = {
  grinding: 'Grinding',
  maximalStrength: 'Max Strength',
  strengthSpeed: 'Strength-Speed',
  power: 'Power',
  speed: 'Speed',
};

/** Zone ids ordered slow → fast — the canonical band order. */
const ZONE_ORDER: readonly VelocityZoneId[] = [
  'grinding',
  'maximalStrength',
  'strengthSpeed',
  'power',
  'speed',
];

/**
 * Build 5 contiguous bands from 4 ascending internal boundaries
 * `[b1, b2, b3, b4]` (grinding|max, max|ss, ss|power, power|speed). The lowest
 * band always starts at 0 and the top band is open (max = null), so the set
 * covers [0, ∞).
 */
function bandsFromBoundaries(
  boundaries: readonly [number, number, number, number]
): VelocityZoneBand[] {
  const mins = [0, boundaries[0], boundaries[1], boundaries[2], boundaries[3]];
  const maxes = [
    boundaries[0],
    boundaries[1],
    boundaries[2],
    boundaries[3],
    null,
  ] as const;
  return ZONE_ORDER.map((id, i) => ({
    id,
    label: ZONE_LABELS[id],
    min: mins[i],
    max: maxes[i],
  }));
}

// =============================================================================
// Movement-class absolute default tables (literature-anchored, mean m/s)
// =============================================================================

/**
 * Canonical mean-velocity boundaries (Mann's zones via GymAware / Jovanović):
 * grinding<0.35, maxStrength<0.50, strengthSpeed<0.75, power<1.00, speed≥1.00.
 */
const COMPOUND_BOUNDARIES: readonly [number, number, number, number] = [0.35, 0.5, 0.75, 1.0];

/**
 * Constant-tension cable/isolation table — shifted down ~0.10–0.15 m/s because
 * a motorized cable holds tension through the full stroke and skews velocities
 * lower than free weight at the same relative load.
 *
 * PLACEHOLDER: the exact cable shift is a literature-anchored starting point
 * pending calibration against real Voltra session data (same posture as the
 * placeholder RIR coefficients in rir-exercise-specific.ts).
 */
const CABLE_BOUNDARIES: readonly [number, number, number, number] = [0.25, 0.4, 0.6, 0.85];

/** Higher-amplitude ballistic / Olympic table — shifted up. */
const BALLISTIC_BOUNDARIES: readonly [number, number, number, number] = [0.5, 0.8, 1.1, 1.4];

function boundariesForClass(
  movementClass: MovementClass
): readonly [number, number, number, number] {
  switch (movementClass) {
    case 'ballistic':
      return BALLISTIC_BOUNDARIES;
    case 'cable':
    case 'isolation':
      return CABLE_BOUNDARIES;
    case 'compound':
    default:
      return COMPOUND_BOUNDARIES;
  }
}

// =============================================================================
// Profile-derived construction
// =============================================================================

/**
 * Fixed %1RM cut-points (fractions of estimated1RM) that anchor the four
 * internal band boundaries. Higher %1RM → lower velocity, so mapping these
 * through the individual profile yields ascending velocity boundaries.
 */
const PERCENT_1RM_ANCHORS: readonly [number, number, number, number] = [0.9, 0.8, 0.65, 0.5];

/**
 * Build boundaries from an LV profile: evaluate `predictVelocity` at fixed
 * %1RM loads, floor each at the profile MVT and cap at the profile intercept
 * (V0), then enforce a strictly non-decreasing sequence so the bands stay
 * contiguous even for a marginal fit.
 */
function boundariesFromProfile(
  profile: LoadVelocityProfile,
  mvt: number
): [number, number, number, number] {
  const cap = Math.max(profile.intercept, mvt);
  const raw = PERCENT_1RM_ANCHORS.map((pct) => {
    const load = pct * profile.estimated1RM;
    const v = predictVelocity(profile, load);
    return Math.min(cap, Math.max(mvt, v));
  });

  // Enforce ascending order (velocity rises as %1RM falls).
  const sorted = [...raw].sort((a, b) => a - b);
  let prev = sorted[0];
  const monotone = sorted.map((v) => {
    const next = Math.max(v, prev);
    prev = next;
    return next;
  });
  return [monotone[0], monotone[1], monotone[2], monotone[3]];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve the velocity-zone bands to use, in priority order:
 *
 *   1. **Profile-derived** — when a usable `LoadVelocityProfile` is supplied
 *      (`confidence !== 'low'`): boundaries are anchored at fixed %1RM loads and
 *      mapped through the individual's own profile via `predictVelocity`,
 *      floored at the profile MVT and capped at V0 (`intercept`). Zones ride the
 *      profile and upgrade automatically as data accrues. `source: 'profile'`.
 *   2. **Movement-class default** — a literature-anchored absolute table chosen
 *      by `movementClass` (compound / cable / isolation / ballistic).
 *      `source: 'movement-class-default'`.
 *   3. **Global default** — the generic compound table.
 *      `source: 'global-default'`.
 *
 * All returned bands are MEAN concentric velocity (m/s), WA-D02.
 */
export function getVelocityZones(opts?: GetVelocityZonesOptions): VelocityZones {
  const profile = opts?.profile;
  const mvt = opts?.mvt ?? profile?.mvt ?? DEFAULT_MVT;

  if (profile && profile.confidence !== 'low' && profile.estimated1RM > 0) {
    return {
      bands: bandsFromBoundaries(boundariesFromProfile(profile, mvt)),
      source: 'profile',
      basis: {
        mvt,
        v0: profile.intercept,
        estimated1RM: profile.estimated1RM,
        exerciseId: opts?.exerciseId,
        movementClass: opts?.movementClass,
      },
    };
  }

  if (opts?.movementClass) {
    return {
      bands: bandsFromBoundaries(boundariesForClass(opts.movementClass)),
      source: 'movement-class-default',
      basis: { mvt, exerciseId: opts.exerciseId, movementClass: opts.movementClass },
    };
  }

  return {
    bands: bandsFromBoundaries(COMPOUND_BOUNDARIES),
    source: 'global-default',
    basis: { mvt, exerciseId: opts?.exerciseId },
  };
}

/**
 * Categorize a MEAN concentric velocity (m/s) into its zone id.
 *
 * Boundary values land in the UPPER band (band `min` is inclusive, `max`
 * exclusive). Velocities below the lowest boundary return `'grinding'`; above
 * the top boundary return `'speed'`.
 *
 * Back-compatible single-argument call: `zones` defaults to the global-default
 * compound bands, so existing `categorizeVelocity(v)` callers keep working
 * (the returned id set is the widened 5-zone taxonomy).
 */
export function categorizeVelocity(
  velocity: number,
  zones: VelocityZones = getVelocityZones()
): VelocityZoneId {
  const { bands } = zones;
  for (const band of bands) {
    if (band.max === null || velocity < band.max) return band.id;
  }
  return bands[bands.length - 1].id;
}
