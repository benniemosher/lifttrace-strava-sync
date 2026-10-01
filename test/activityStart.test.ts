import { describe, expect, it } from 'vitest';
import { activityStart, buildSetMessages, buildStravaActivity } from '../src/strava';

describe('activityStart', () => {
	it('back-computes the start from completion for a workout finished the same day', () => {
		expect(activityStart('2026-09-24', '2026-09-25T00:24:22.000Z', 45 * 60).toISOString()).toBe('2026-09-24T23:39:22.000Z');
	});

	it('keeps same-day behavior when completion is the next UTC day but the same local day', () => {
		// 9:30pm in Denver on 9/24 is 03:30Z on 9/25.
		expect(activityStart('2026-09-24', '2026-09-25T03:30:00.000Z', 60 * 60).toISOString()).toBe('2026-09-25T02:30:00.000Z');
	});

	it('uses noon in the athlete time zone on the workout date for a workout logged days later', () => {
		// Tuesday 9/29 push day, entered and completed on 10/1. Noon MDT is 18:00Z.
		expect(activityStart('2026-09-29', '2026-10-01T15:02:45.000Z', 45 * 60).toISOString()).toBe('2026-09-29T18:00:00.000Z');
	});

	it('uses the standard-time offset for a backfill in winter', () => {
		// Noon MST is 19:00Z.
		expect(activityStart('2026-12-01', '2026-12-04T15:00:00.000Z', 600).toISOString()).toBe('2026-12-01T19:00:00.000Z');
	});

	it('falls back to completion time when the workout date is malformed', () => {
		expect(activityStart('', '2026-10-01T15:00:00.000Z', 600).toISOString()).toBe('2026-10-01T14:50:00.000Z');
	});
});

// Tuesday's push day as the workout.completed webhook delivers it, two days late.
const backfilled = {
	date: '2026-09-29',
	logged: true,
	name: 'Push Day',
	completed: true,
	duration_min: null,
	exercises: [
		{ exercise_name: 'Pec Deck', sets: [{ weight: 100, reps: 15, completed: true }] },
		{ exercise_name: 'Shoulder Press (Machine)', sets: [{ weight: 80, reps: 15, completed: true }] },
	],
};

describe('backfilled workouts on both posting paths', () => {
	it('dates the Set Messages upload on the workout date', () => {
		const upload = buildSetMessages(backfilled as never, '2026-10-01T20:05:30.000Z');
		expect(upload).not.toBeNull();
		expect(upload!.json.start_time).toBe('2026-09-29T18:00:00.000Z');
		expect(upload!.name).toBe('Push Day');
	});

	it('dates the create-activity fallback on the workout date', () => {
		const activity = buildStravaActivity(backfilled as never, '2026-10-01T20:05:30.000Z');
		expect(activity.start_date_local).toBe('2026-09-29T18:00:00.000Z');
		expect(activity.name).toBe('Push Day');
	});
});
