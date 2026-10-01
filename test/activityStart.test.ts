import { describe, expect, it } from 'vitest';
import { activityStart } from '../src/strava';

describe('activityStart', () => {
	it('back-computes the start from completion for a workout finished the same day', () => {
		expect(activityStart('2026-09-24', '2026-09-25T00:24:22.000Z', 45 * 60)).toBe('2026-09-24T23:39:22.000Z');
	});

	it('keeps same-day behavior when completion is the next UTC day but the same local day', () => {
		// 9:30pm in Denver on 9/24 is 03:30Z on 9/25.
		expect(activityStart('2026-09-24', '2026-09-25T03:30:00.000Z', 60 * 60)).toBe('2026-09-25T02:30:00.000Z');
	});

	it('uses noon local on the workout date for a workout logged days later', () => {
		// Tuesday 9/29 push day, entered and completed on 10/1.
		expect(activityStart('2026-09-29', '2026-10-01T15:02:45.000Z', 45 * 60)).toBe('2026-09-29T12:00:00');
	});

	it('falls back to completion time when the workout date is malformed', () => {
		expect(activityStart('', '2026-10-01T15:00:00.000Z', 600)).toBe('2026-10-01T14:50:00.000Z');
	});
});
