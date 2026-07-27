/**
 * BaselineKey - the identity a calibration baseline (or a derived series) belongs to.
 *
 * A baseline is only meaningful for a specific measurement stream. Four
 * dimensions define that stream:
 *
 * - `userId`    — one machine can be shared by several people.
 * - `exerciseId`— the movement being measured.
 * - `setupId`   — the *physical* configuration (bench height, cable attachment,
 *                 stance). Typically INFERRED (e.g. from ROM clustering) rather
 *                 than declared. Deliberately distinct from device settings
 *                 (chains / damper / eccentric), which are a separate dimension
 *                 and live on `LoadSettings`.
 * - `side`      — a bilateral lift produces two independent measurement streams.
 *
 * The side-agnostic view is DERIVED by merging the two per-side distributions
 * (see `mergeDist` in `stats/distribution`), NOT collected as a third stream —
 * otherwise time-to-calibrated doubles.
 *
 * This library does not store baselines; it only stamps the identity onto the
 * baseline and series types so a storage layer can key on it without inventing
 * a parallel model.
 */

/** Which limb / cable a measurement stream came from. */
export type BaselineSide = 'left' | 'right';

/**
 * Identity of a calibration baseline: `(user, exercise, setup, side)`.
 *
 * `setupId` and `side` are optional. Omitted means "not distinguished" — a
 * baseline with no `side` is the merged, side-agnostic view; a baseline with
 * no `setupId` pools all physical configurations.
 */
export interface BaselineKey {
  userId: string;
  exerciseId: string;
  /** Physical configuration id (inferred, not device settings). */
  setupId?: string;
  /** `'left' | 'right'`; omit for the merged side-agnostic view. */
  side?: BaselineSide;
}

/** Wildcard segment used for omitted dimensions in `baselineKeyId`. */
const ANY = '*';

/**
 * Stable, collision-free string id for a `BaselineKey`, suitable as a storage
 * key or map key.
 *
 * Segments are percent-encoded, so ids containing the `|` delimiter (or any
 * other reserved character) cannot collide. Omitted dimensions serialize to
 * `*`; `encodeURIComponent` leaves `*` alone, so it is escaped explicitly to
 * keep a literal asterisk distinguishable from the wildcard.
 */
export function baselineKeyId(key: BaselineKey): string {
  const seg = (v: string | undefined): string =>
    v === undefined ? ANY : encodeURIComponent(v).replace(/\*/g, '%2A');
  return [seg(key.userId), seg(key.exerciseId), seg(key.setupId), seg(key.side)].join('|');
}

/**
 * Does `key` satisfy `filter`?
 *
 * Fields left `undefined` on the filter are wildcards — `{ userId: 'u' }`
 * matches every exercise, setup and side for that user. Fields present on the
 * filter must match exactly. There is therefore no way to filter *for* the
 * merged (side-less) view: that view is derived, not selected — compare
 * `baselineKeyId` directly if you need exact identity.
 */
export function matchesBaselineKey(key: BaselineKey, filter: Partial<BaselineKey>): boolean {
  return (Object.keys(filter) as Array<keyof BaselineKey>).every(
    (field) => filter[field] === undefined || key[field] === filter[field]
  );
}

/** True when two keys denote the same measurement stream. */
export function baselineKeyEquals(a: BaselineKey, b: BaselineKey): boolean {
  return baselineKeyId(a) === baselineKeyId(b);
}
