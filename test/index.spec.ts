import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import worker from '../src/index';
import { verifyLiftTraceSignature } from '../src/hmac';
import { buildSetMessages, buildStravaActivity } from '../src/strava';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('health check', () => {
	it('GET / reports ok', async () => {
		const ctx = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://example.com/'), env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true });
	});

	it('unknown path 404s', async () => {
		const res = await SELF.fetch('https://example.com/nope');
		expect(res.status).toBe(404);
	});
});

describe('webhook signature verification', () => {
	const secret = 'test-secret';

	it('accepts a correctly signed body', () => {
		const body = JSON.stringify({ event: 'test', timestamp: 'now', data: {} });
		const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
		expect(verifyLiftTraceSignature(body, sig, secret)).toBe(true);
	});

	it('rejects a tampered body', () => {
		const body = JSON.stringify({ event: 'test', timestamp: 'now', data: {} });
		const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
		expect(verifyLiftTraceSignature(body + 'x', sig, secret)).toBe(false);
	});

	it('rejects a missing header', () => {
		expect(verifyLiftTraceSignature('{}', null, secret)).toBe(false);
	});

	it('rejects a malformed header', () => {
		expect(verifyLiftTraceSignature('{}', 'not-sha256-prefixed', secret)).toBe(false);
	});

	it('POST /webhook 401s on a bad signature', async () => {
		const res = await SELF.fetch('https://example.com/webhook', {
			method: 'POST',
			headers: { 'X-LiftTrace-Signature': 'sha256=deadbeef' },
			body: JSON.stringify({ event: 'test', timestamp: 'now', data: {} }),
		});
		expect(res.status).toBe(401);
	});
});

describe('buildStravaActivity', () => {
	it('formats weighted sets and falls back on a missing duration', () => {
		const activity = buildStravaActivity(
			{
				date: '2026-09-21',
				logged: true,
				name: 'Pull',
				completed: true,
				duration_min: null,
				exercises: [
					{
						exercise_id: 1,
						exercise_name: 'Lat Pulldown (Machine)',
						superset_id: null,
						set_type: null,
						sets: [
							{ reps: 15, weight: 140, completed: true, warmup: false, rpe: null, duration_sec: null },
							{ reps: 12, weight: 140, completed: true, warmup: false, rpe: null, duration_sec: null },
						],
					},
				],
			},
			'2026-09-21T18:00:00.000Z',
		);

		expect(activity.name).toBe('Pull');
		expect(activity.sport_type).toBe('WeightTraining');
		expect(activity.elapsed_time).toBe(45 * 60); // default, duration_min was null
		expect(activity.description).toBe('Lat Pulldown (Machine): 140x15, 140x12\n\nMuscles worked: Latissimus dorsi');
		// start = completedAt - elapsed
		expect(activity.start_date_local).toBe(new Date('2026-09-21T17:15:00.000Z').toISOString());
	});

	it('formats a timed set (no weight/reps) using duration_sec', () => {
		const activity = buildStravaActivity(
			{
				date: '2026-09-21',
				logged: true,
				name: 'Pull',
				completed: true,
				duration_min: 50,
				exercises: [
					{
						exercise_id: 2,
						exercise_name: 'Dead Hang',
						superset_id: null,
						set_type: 'time',
						sets: [{ reps: 0, weight: 0, completed: true, warmup: false, rpe: null, duration_sec: 20 }],
					},
				],
			},
			'2026-09-21T18:00:00.000Z',
		);
		expect(activity.elapsed_time).toBe(50 * 60);
		expect(activity.description).toBe('Dead Hang: 20s');
	});

	it("falls back to 'Workout' when the session has no name", () => {
		const activity = buildStravaActivity(
			{ date: '2026-09-21', logged: true, name: null, completed: true, duration_min: 30, exercises: [] },
			'2026-09-21T18:00:00.000Z',
		);
		expect(activity.name).toBe('Workout');
	});

	it('dedupes muscles across exercises and skips an unmapped exercise silently', () => {
		const mk = (name: string) => ({
			exercise_id: 1,
			exercise_name: name,
			superset_id: null,
			set_type: null,
			sets: [{ reps: 10, weight: 100, completed: true, warmup: false, rpe: null, duration_sec: null }],
		});
		const activity = buildStravaActivity(
			{
				date: '2026-09-21',
				logged: true,
				name: 'Push',
				completed: true,
				duration_min: 45,
				exercises: [
					mk('Chest Press'), // Pectoralis major
					mk('Dumbbell Shoulder Press'), // Shoulders — also hits Triceps as secondary, ignored (primary only)
					mk('Some Brand New Machine Nobody Mapped Yet'), // not in MUSCLE_MAP at all
				],
			},
			'2026-09-21T18:00:00.000Z',
		);
		// One line per exercise, still — the unmapped one contributes no
		// muscle-line text but isn't dropped from the set/rep log itself.
		expect(activity.description).toContain('Some Brand New Machine Nobody Mapped Yet: 100x10');
		expect(activity.description).toMatch(/Muscles worked: Pectoralis major, Shoulders$/);
	});
});

describe('buildSetMessages', () => {
	const mkSet = (reps: number, weight: number) => ({ reps, weight, completed: true, warmup: false, rpe: null, duration_sec: null });

	it('converts weight to kg and maps reps for a mapped exercise', () => {
		const setMessages = buildSetMessages(
			{
				date: '2026-09-21',
				logged: true,
				name: 'Pull',
				completed: true,
				duration_min: 45,
				exercises: [
					{
						exercise_id: 1,
						exercise_name: 'Lat Pulldown (Machine)',
						superset_id: null,
						set_type: null,
						sets: [mkSet(15, 140), mkSet(12, 140)],
					},
				],
			},
			'2026-09-21T18:00:00.000Z',
		);

		expect(setMessages).not.toBeNull();
		expect(setMessages!.json.version).toBe('1.0');
		expect(setMessages!.json.elapsed_time).toBe(45 * 60);
		expect(typeof setMessages!.json.utc_offset).toBe('number');
		expect(setMessages!.json.sets).toEqual([
			{ exercise_type: 'LAT_PULLDOWN', repetitions: 15, weight: 63.5 },
			{ exercise_type: 'LAT_PULLDOWN', repetitions: 12, weight: 63.5 },
		]);
		expect(setMessages!.name).toBe('Pull');
	});

	it('carries duration_sec instead of weight/reps for a timed exercise', () => {
		const setMessages = buildSetMessages(
			{
				date: '2026-09-21',
				logged: true,
				name: 'Pull',
				completed: true,
				duration_min: 45,
				exercises: [
					{
						exercise_id: 2,
						exercise_name: 'Dead Hang',
						superset_id: null,
						set_type: 'time',
						sets: [{ reps: null, weight: null, completed: true, warmup: false, rpe: null, duration_sec: 20 }],
					},
				],
			},
			'2026-09-21T18:00:00.000Z',
		);

		expect(setMessages!.json.sets).toEqual([{ exercise_type: 'DEAD_HANG', duration: 20 }]);
	});

	it('skips an unmapped exercise from the structured sets array but keeps it in the description', () => {
		const setMessages = buildSetMessages(
			{
				date: '2026-09-21',
				logged: true,
				name: 'Pull',
				completed: true,
				duration_min: 45,
				exercises: [
					{
						exercise_id: 1,
						exercise_name: 'Lat Pulldown (Machine)',
						superset_id: null,
						set_type: null,
						sets: [mkSet(15, 140)],
					},
					{
						exercise_id: 3,
						exercise_name: 'Some Brand New Machine Nobody Mapped Yet',
						superset_id: null,
						set_type: null,
						sets: [mkSet(10, 100)],
					},
				],
			},
			'2026-09-21T18:00:00.000Z',
		);

		expect(setMessages!.json.sets).toHaveLength(1);
		expect(setMessages!.description).toContain('Some Brand New Machine Nobody Mapped Yet: 100x10');
	});

	it('returns null when no exercise in the workout has a Strava mapping', () => {
		const setMessages = buildSetMessages(
			{
				date: '2026-09-21',
				logged: true,
				name: 'Pull',
				completed: true,
				duration_min: 45,
				exercises: [
					{
						exercise_id: 3,
						exercise_name: 'Some Brand New Machine Nobody Mapped Yet',
						superset_id: null,
						set_type: null,
						sets: [mkSet(10, 100)],
					},
				],
			},
			'2026-09-21T18:00:00.000Z',
		);

		expect(setMessages).toBeNull();
	});
});
