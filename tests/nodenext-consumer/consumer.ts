// Type-checked against the packed tarball by scripts/check-types-nodenext.mjs (VW-564).
// If the published declarations stop resolving under NodeNext, every import below
// degrades to `any`, the not-any checks fail and the @ts-expect-error lines go unused.
import { slopeStandardError, type TrendAnalysis } from '@voltras/workout-analytics';
import { weightDeviationRatio, type VelocityLossVerdict } from '@voltras/workout-analytics/view';
import { sessionSchema, type Session } from '@voltras/workout-analytics/schema';
import type { SessionStore } from '@voltras/workout-analytics/store';

type IsAny<T> = 0 extends 1 & T ? true : false;

export const rootIsTyped: [IsAny<TrendAnalysis>, IsAny<typeof slopeStandardError>] = [false, false];
export const viewIsTyped: [IsAny<VelocityLossVerdict>, IsAny<typeof weightDeviationRatio>] = [
  false,
  false,
];
export const schemaIsTyped: [IsAny<Session>, IsAny<typeof sessionSchema>] = [false, false];
export const storeIsTyped: IsAny<SessionStore> = false;

export const standardError: number | null = slopeStandardError(0.5, 0.8, 6);

// @ts-expect-error slope must be a number
slopeStandardError('0.5', 0.8, 6);

// @ts-expect-error the ratio is number | null, not a string
export const ratio: string = weightDeviationRatio(100, 95);
