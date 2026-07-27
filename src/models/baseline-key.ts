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
 * BUT the merged view is for DISPLAY and collection economy only. It is not a
 * valid comparison reference for assessing a rep. `mergeDist` is arithmetically
 * correct, and that is exactly the problem: merged variance is within-side PLUS
 * between-side, so any left/right asymmetry inflates the merged SD. With
 * per-side SD 0.0205 m and means of 0.60 m left / 0.50 m right, the merged SD
 * is 0.0545 m — 2.66x inflated. A right-side rep at 0.44 m then scores
 * z = -2.92 (a clear warning) against its own side but only z = -2.02 against
 * the merged view, while its ratio against the merged mean reads 0.800 —
 * WORSE than against its own side. The z-score and the ratio move in OPPOSITE
 * directions, and `getRepQualityFlags` computes both.
 *
 * So: assess a rep against the baseline for ITS OWN side. Use the merged view
 * to show a single number, never to decide whether a rep was good. Asymmetry is
 * the normal case on a bilateral lift, not an edge case.
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
 * `setupId` and `side` are optional. Omitted means the baseline does not
 * DISTINGUISH that dimension — a baseline with no `side` is the merged,
 * side-agnostic view; a baseline with no `setupId` was not collected against
 * any particular physical configuration.
 *
 * That is a statement about the baseline, not about matching. Wildcards live on
 * the FILTER side only (see `matchesBaselineKey`): an undistinguished baseline
 * is not selected by a filter that names the dimension the baseline lacks. A
 * pooled `{ userId, exerciseId }` key does not answer a query for
 * `{ setupId: 'bench-low' }`.
 */
export interface BaselineKey {
  userId: string;
  exerciseId: string;
  /** Physical configuration id (inferred, not device settings). */
  setupId?: string;
  /** `'left' | 'right'`; omit for the merged side-agnostic view. */
  side?: BaselineSide;
}

/**
 * A partial `BaselineKey` used to SELECT measurement streams rather than to
 * identify one. Fields left undefined are wildcards — see `matchesBaselineKey`.
 *
 * Named distinctly from `BaselineKey` so the public `key` fields that are
 * filters (`BuildTimeSeriesConfig.key`, `MetricTimeSeries.key`) don't read as
 * the same thing as the identity `key` fields sitting next to them.
 */
export type BaselineKeyFilter = Partial<BaselineKey>;

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
 *
 * @throws {TypeError} if any id is not well-formed UTF-16 (a lone surrogate).
 * `encodeURIComponent` raises `URIError` on such input; since this is a
 * storage-key generator over caller-supplied ids, that is re-thrown as a
 * `TypeError` naming the offending field rather than surfacing as a URI error
 * from a function that has nothing to do with URIs.
 */
export function baselineKeyId(key: BaselineKey): string {
  const seg = (field: keyof BaselineKey, v: string | undefined): string => {
    if (v === undefined) return ANY;
    try {
      return encodeURIComponent(v).replace(/\*/g, '%2A');
    } catch (err) {
      throw new TypeError(
        `BaselineKey.${field} is not well-formed UTF-16 (lone surrogate); ids must be encodable`,
        { cause: err }
      );
    }
  };
  return [
    seg('userId', key.userId),
    seg('exerciseId', key.exerciseId),
    seg('setupId', key.setupId),
    seg('side', key.side),
  ].join('|');
}

/**
 * Does `key` satisfy `filter`?
 *
 * Fields left `undefined` on the filter are wildcards — `{ userId: 'u' }`
 * matches every exercise, setup and side for that user. Fields present on the
 * filter must match exactly.
 *
 * The wildcard rule is ASYMMETRIC: it applies to the filter, never to the key.
 * A key that omits a dimension does not match a filter that names it —
 * `matchesBaselineKey({ userId: 'u', exerciseId: 'row' }, { setupId: 'bench-low' })`
 * is `false`, not `true`. So a setup-specific series excludes a user's pooled,
 * setup-less sessions; that is the intended reading (a pooled baseline cannot
 * vouch for a particular setup), but it means callers wanting both must query
 * twice. There is likewise no way to filter *for* the merged, side-less view:
 * that view is derived, not selected — compare `baselineKeyId` directly if you
 * need exact identity.
 */
export function matchesBaselineKey(key: BaselineKey, filter: BaselineKeyFilter): boolean {
  return (Object.keys(filter) as Array<keyof BaselineKey>).every(
    (field) => filter[field] === undefined || key[field] === filter[field]
  );
}

/** True when two keys denote the same measurement stream. */
export function baselineKeyEquals(a: BaselineKey, b: BaselineKey): boolean {
  return baselineKeyId(a) === baselineKeyId(b);
}
