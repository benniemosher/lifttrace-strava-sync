import type { LiftTraceWorkout } from './lifttrace';

const TOKEN_URL = 'https://www.strava.com/oauth/token';
const ACTIVITIES_URL = 'https://www.strava.com/api/v3/activities';
const KV_KEY = 'tokens';

// A workout with no duration_min logged (common — LiftTrace doesn't
// require one) gets this as its elapsed_time estimate. Strava requires
// elapsed_time; there's no honest way to derive it from a rep/weight
// log alone, so this is a documented guess, not a measurement.
const DEFAULT_ELAPSED_SECONDS = 45 * 60;

export interface StravaTokens {
	access_token: string;
	refresh_token: string;
	/** Unix seconds, per Strava's own `expires_at`. */
	expires_at: number;
}

export async function exchangeCodeForTokens(code: string, clientId: string, clientSecret: string): Promise<StravaTokens> {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: 'authorization_code',
		}),
	});
	if (!res.ok) {
		throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
	}
	const json = (await res.json()) as StravaTokens;
	return json;
}

async function refreshTokens(refreshToken: string, clientId: string, clientSecret: string): Promise<StravaTokens> {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
		}),
	});
	if (!res.ok) {
		throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
	}
	const json = (await res.json()) as StravaTokens;
	return json;
}

export async function saveTokens(kv: KVNamespace, tokens: StravaTokens): Promise<void> {
	await kv.put(KV_KEY, JSON.stringify(tokens));
}

/** Reads the stored tokens, refreshing first if the access token is
 * expired or about to be (60s of slack for request-in-flight time). */
export async function getFreshAccessToken(kv: KVNamespace, clientId: string, clientSecret: string): Promise<string> {
	const raw = await kv.get(KV_KEY);
	if (!raw) {
		throw new Error('No Strava tokens stored yet — visit /oauth/start to authorize this relay against your Strava account.');
	}
	const tokens = JSON.parse(raw) as StravaTokens;
	const nowSec = Math.floor(Date.now() / 1000);
	if (tokens.expires_at > nowSec + 60) {
		return tokens.access_token;
	}
	const refreshed = await refreshTokens(tokens.refresh_token, clientId, clientSecret);
	await saveTokens(kv, refreshed);
	return refreshed.access_token;
}

function fmtSet(s: { weight: number | null; reps: number | null; duration_sec: number | null }): string {
	if (s.duration_sec != null) return `${s.duration_sec}s`;
	const w = s.weight != null && s.weight > 0 ? `${s.weight}x` : '';
	return `${w}${s.reps ?? '?'}`;
}

/** Builds the Strava "create activity" request body from a LiftTrace
 * workout.completed payload. */
export function buildStravaActivity(workout: LiftTraceWorkout, completedAtIso: string) {
	const lines = workout.exercises.map((ex) => {
		const sets = ex.sets.map(fmtSet).join(', ');
		return `${ex.exercise_name}: ${sets}`;
	});

	const elapsedSeconds = workout.duration_min != null ? Math.round(workout.duration_min * 60) : DEFAULT_ELAPSED_SECONDS;

	// completedAtIso is when the set was marked done (the webhook's own
	// `timestamp`) — treat that as the activity's END and back-compute a
	// start so Strava's timeline roughly lines up with when the workout
	// actually finished, bounded by however accurate elapsedSeconds is.
	const startDateLocal = new Date(new Date(completedAtIso).getTime() - elapsedSeconds * 1000).toISOString();

	return {
		name: workout.name || 'Workout',
		sport_type: 'WeightTraining',
		start_date_local: startDateLocal,
		elapsed_time: elapsedSeconds,
		description: lines.join('\n'),
	};
}

export async function createStravaActivity(accessToken: string, activity: ReturnType<typeof buildStravaActivity>): Promise<unknown> {
	const res = await fetch(ACTIVITIES_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(activity),
	});
	if (!res.ok) {
		throw new Error(`Strava activity creation failed: ${res.status} ${await res.text()}`);
	}
	return res.json();
}
