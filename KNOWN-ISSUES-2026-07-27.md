# Known issues — filed 2026-07-27

Findings from the adversarial math/physics review of the 2.0.0 position-units PR
(#25). Each was **verified against source** at the cited location. None is fixed
here: they are pre-existing and out of scope for a units change, and fixing them
inside that PR would have made its diff unreviewable. Filed so they are not lost.

Ordered roughly by severity.

---

## 1. `calculateFrameLoad`'s chains ramp models INVERSE chains, not chains

`src/models/load.ts` — `chainsFactor = clamp(1 − position / chainsFullExtension, 0, 1)`

The ramp is **descending** in extension: maximum at `position = 0`, zero at full
extension. That is the opposite of physical barbell chains, where links leaving
the floor transfer their weight onto the bar and resistance **rises** through the
concentric.

It is also the opposite of what this device calls regular chains.
`voltra-node-sdk` `src/sdk/voltra-client.ts:693-700` documents `setInverseChains`
as:

> "Inverse chains reduce resistance during the concentric (lifting) phase and add
> resistance during the eccentric (lowering) phase - opposite of regular chains."

`WorkoutSample.position` is 0 at rest and grows with extension, and the concentric
is the extending phase. So a term that falls with position reduces resistance
through the concentric — the device's **inverse**-chains behaviour, carried under
the name `chains`.

Two consequences:

- If the sign is wrong, every chains-set load is wrong, and no ratio-based
  analytic will reveal it — the error is monotone in position, so ROM ratios,
  velocity loss and fatigue indices all look normal.
- `LoadSettings` has no `inverseChains` field at all, so the device's inverse-chains
  mode (exposed as a weight in pounds, not a boolean) is entirely unmodelled.

`eccentric` is **not** affected — it is correctly phase-gated to
`MovementPhase.ECCENTRIC`.

**Not fixed here deliberately.** Flipping the direction changes every chains-set
load and needs its own change with its own review. The 2.0.0 tests pin the current
shape as a change-detector, explicitly not as a validated physical model.

## 2. `findOutlierReps` is mathematically unreachable for n ≤ 5

`src/analytics/fatigue.ts:379-433`, threshold `src/stats/schemes.ts:191-194`

Gates at `set.reps.length >= 3`, then flags `|z| >= 2.0`
(`DEFAULT_OUTLIER_SCHEME`). But Samuelson's inequality caps the maximum possible
z-score of any element of an n-sample set. `getVariance`
(`src/stats/distribution.ts:108-111`) divides `m2` by `n − 1`, so the applicable
bound is `(n−1)/√n`:

| n | max \|z\| | can reach 2.0? |
| --- | --- | --- |
| 3 | 1.1547 | no |
| 4 | 1.5000 | no |
| 5 | 1.7889 | no |
| 6 | 2.0412 | barely |

So for 3-, 4- and 5-rep sets the function **cannot return a result** regardless of
the data. Since most working sets are 3–5 reps, the function is effectively dead
on its primary input.

Verified empirically against this code: for the maximising configuration (one
outlier, all other values identical) the observed max `|z|` is 1.1547 / 1.5000 /
1.7889 / 2.0412 for n = 3 / 4 / 5 / 6, matching the table. ROMs
`[0.6, 0.6, 0.6, 0.6, 0.2]` — a final rep at one third its neighbours — yield
max `|z| = 1.7889` and `findOutlierReps` returns `[]`.

Fix: an n-aware threshold (Grubbs' critical value), or an explicit documented
`n >= 6` gate so callers stop expecting it to fire.

## 3. `detectPlateau`'s early `break` under-reports plateau length

`src/analytics/trend.ts:262-268`

The loop breaks on the first failing window, commenting that a failing run cannot
be rescued by extending it. That is false, because the reference is a **median**,
which moves as the window grows.

Counterexample at `thresholdPct = 5`: series `[95, 95, 102, 102]` on consecutive
days. `[95, 102, 102]` fails (median 102, so 95 is 6.86% below) and the loop
breaks, so `[95, 95, 102, 102]` is never tested — though it qualifies (median
98.5, max deviation 3.55%).

Verified empirically: `detectPlateau(series, 5, 1)` returns
`plateauDays: 1` ("2 points") where the full 4-point window spans 3 days.

## 4. `updateBaselineWithPoint`'s documented timestamp default is not implemented

`src/vbt/baseline.ts:133` (doc) vs `:142-146` (implementation)

The JSDoc says `opts.timestamp` "defaults to `Date.now()`". The implementation
only spreads a timestamp when one was explicitly passed. So a baseline built from
points that never carried timestamps can never satisfy `hasTimestamps`
(`:153`), and eviction always takes the `else` branch: `combined.slice(1)` on an
array that `buildBaseline` has **load-sorted**.

That drops the **lowest-load** point every time, not the oldest. The load-velocity
profile is systematically eaten from below, biasing the regression's intercept
(and therefore V0 and every %1RM-anchored velocity zone) upward over time.

Fix either the doc or the default — but note that implementing the documented
default also silently changes eviction order for existing callers.

## 5. `getRepWork` integrates path length; ROM integrates net displacement

`src/analytics/rep-analytics.ts:135-157` vs `src/models/phase.ts` (`getPhaseRangeOfMotion`)

`getRepWork` sums `Math.abs(Δposition)` sample-to-sample — path length, which
accumulates every reversal. `getPhaseRangeOfMotion` takes
`|endPosition − startPosition|` — net displacement, which does not. Under sensor
jitter the two disagree: 1 mm of noise per sample on a 0.6 m raise inflates work
by 1.83% while leaving ROM unchanged, so work-per-ROM drifts with noise alone.

`getRepWork` should skip HOLD/IDLE samples the way `getPhaseMeanVelocity` already
does.

Related, and already documented in 2.0.0 rather than fixed: `getRepTotalWork` sums
two positive magnitudes, so it is not net mechanical work and must not be
converted to Joules.

## 6. `analyzeTrend`'s flat threshold is an absolute constant on a metric-agnostic series

`src/analytics/trend.ts:123` — `flatThresholdPerDay ?? 0.001`

`TimeSeries` carries no units, and `MetricKey` already spans velocity (m/s),
volume (lbs) and weight (lbs), whose natural per-day slopes differ by orders of
magnitude. The default happens to suit velocity. It is fine today only because
every current caller is velocity-shaped; adding a ROM series to `MetricKey` breaks
it silently — a ROM trend in metres would be called "flat" up to 1 mm/day, which
is most real progressions.

Fix: scale the threshold to the series (e.g. a fraction of its mean or SD), or
require it per metric.

## 7. `computeVBTSetFatigueIndex` does not redistribute weight as documented

`src/analytics/fatigue.ts:559-562` (doc) vs `:608-612` (implementation)

The docstring promises that when an augmentation cannot be computed, "its weight
is redistributed **proportionally** to the remaining components". The
implementation dumps all missing weight onto velocity
(`effectiveWVel = wVel + missing`), which is a defensible choice — velocity is the
primary signal — but it is not what the doc says, and it changes the index for
every single-rep or zero-baseline set relative to the documented behaviour.

Fix the doc or the code; they cannot both be right.
