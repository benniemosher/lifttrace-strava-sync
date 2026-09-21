import type { LiftTraceWorkout } from './lifttrace';
import { EXERCISE_TYPE_MAP } from './exerciseTypes';
import { musclesWorked } from './muscles';

const TOKEN_URL = 'https://www.strava.com/oauth/token';
const ACTIVITIES_URL = 'https://www.strava.com/api/v3/activities';
const UPLOADS_URL = 'https://www.strava.com/api/v3/uploads';
const KV_KEY = 'tokens';

// A workout with no duration_min logged (common — LiftTrace doesn't
// require one) gets this as its elapsed_time estimate. Strava requires
// elapsed_time; there's no honest way to derive it from a rep/weight
// log alone, so this is a documented guess, not a measurement.
const DEFAULT_ELAPSED_SECONDS = 45 * 60;

// Strava's Set Messages weight field is kilograms; LiftTrace logs in lbs.
const LBS_TO_KG = 0.45359237;

// This relay serves one athlete on one gym schedule — no per-user timezone
// setting exists anywhere in this codebase, so this is hardcoded rather
// than plumbed through as config for a single call site.
const ATHLETE_TIME_ZONE = 'America/Denver';

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

	// Strava's activity API has no muscle-group field at all — this is
	// folded into the description text instead. Exercises with no entry
	// in MUSCLE_MAP (a program change, a one-off) are silently skipped
	// rather than blocking the whole line.
	const muscles = musclesWorked(workout.exercises.map((ex) => ex.exercise_name));
	const description = muscles.length > 0 ? `${lines.join('\n')}\n\nMuscles worked: ${muscles.join(', ')}` : lines.join('\n');

	return {
		name: workout.name || 'Workout',
		sport_type: 'WeightTraining',
		start_date_local: startDateLocal,
		elapsed_time: elapsedSeconds,
		description,
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

/** Returns the given date's UTC offset (seconds, positive east of UTC) in
 * `timeZone`, via Intl rather than a hardcoded constant so Denver's DST
 * transition (MST/MDT) resolves correctly without tracking it by hand. */
function getUtcOffsetSeconds(date: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date);
	const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
	const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
	if (!match) return 0;
	const sign = match[1] === '-' ? -1 : 1;
	return sign * (Number(match[2]) * 3600 + Number(match[3]) * 60);
}

export interface StravaSetMessage {
	exercise_type: string;
	repetitions?: number;
	weight?: number;
	duration?: number;
}

export interface StravaSetMessagesUpload {
	version: '1.0';
	start_time: string;
	utc_offset: number;
	elapsed_time: number;
	sets: StravaSetMessage[];
	creator?: { name: string };
}

export interface StravaSetMessagesActivity {
	json: StravaSetMessagesUpload;
	name: string;
	description: string;
}

/** Builds the structured "Set Messages" JSON upload body — this is the
 * only format Strava will render as the visual muscle-map, unlike the
 * plain create-activity endpoint (buildStravaActivity above), which has
 * no set/exercise fields at all. Confirmed against this account's own
 * past Gravl-posted activities, which use this same upload path.
 *
 * Returns null if none of the workout's exercises have a Strava
 * exercise_type mapping (see exerciseTypes.ts) — an empty `sets` array
 * is rejected by Strava outright, so callers should fall back to
 * buildStravaActivity/createStravaActivity in that case. */
export function buildSetMessages(workout: LiftTraceWorkout, completedAtIso: string): StravaSetMessagesActivity | null {
	const elapsedSeconds = workout.duration_min != null ? Math.round(workout.duration_min * 60) : DEFAULT_ELAPSED_SECONDS;
	const startDate = new Date(new Date(completedAtIso).getTime() - elapsedSeconds * 1000);

	const sets: StravaSetMessage[] = [];
	const lines: string[] = [];
	for (const ex of workout.exercises) {
		lines.push(`${ex.exercise_name}: ${ex.sets.map(fmtSet).join(', ')}`);

		const exerciseType = EXERCISE_TYPE_MAP[ex.exercise_name];
		if (!exerciseType) continue; // no Strava mapping — still logged in the text description above, just not in the structured sets array

		for (const s of ex.sets) {
			const set: StravaSetMessage = { exercise_type: exerciseType };
			if (s.reps != null) set.repetitions = s.reps;
			if (s.weight != null && s.weight > 0) set.weight = Math.round(s.weight * LBS_TO_KG * 100) / 100;
			if (s.duration_sec != null) set.duration = s.duration_sec;
			sets.push(set);
		}
	}

	if (sets.length === 0) return null;

	const muscles = musclesWorked(workout.exercises.map((ex) => ex.exercise_name));
	const description = muscles.length > 0 ? `${lines.join('\n')}\n\nMuscles worked: ${muscles.join(', ')}` : lines.join('\n');

	return {
		json: {
			version: '1.0',
			start_time: startDate.toISOString(),
			utc_offset: getUtcOffsetSeconds(startDate, ATHLETE_TIME_ZONE),
			elapsed_time: elapsedSeconds,
			sets,
			creator: { name: 'lifttrace-strava-sync' },
		},
		name: workout.name || 'Workout',
		description,
	};
}

export interface StravaUploadStatus {
	id: number;
	id_str: string;
	external_id: string | null;
	error: string | null;
	status: string;
	activity_id: number | null;
}

// Strava's own docs describe JSON set-message uploads as processing
// quickly (no GPS/FIT parsing involved) — this bound keeps polling well
// inside a Workers request's wall-clock budget rather than assuming an
// arbitrarily long async job.
const UPLOAD_POLL_INTERVAL_MS = 1500;
const UPLOAD_POLL_MAX_ATTEMPTS = 10;

/** Uploads a Set Messages payload via POST /uploads (data_type=json) and
 * polls GET /uploads/:id until Strava finishes processing it into an
 * activity (or reports an error). Returns the final upload status,
 * whose `activity_id` is what actually shows up on the athlete's feed
 * with the muscle-map visualization. */
export async function uploadSetMessages(accessToken: string, activity: StravaSetMessagesActivity): Promise<StravaUploadStatus> {
	const form = new FormData();
	form.append('file', new Blob([JSON.stringify(activity.json)], { type: 'application/json' }), 'workout.json');
	form.append('data_type', 'json');
	form.append('name', activity.name);
	form.append('description', activity.description);
	form.append('sport_type', 'WeightTraining');

	const res = await fetch(UPLOADS_URL, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}` },
		body: form,
	});
	if (!res.ok) {
		throw new Error(`Strava set-messages upload failed: ${res.status} ${await res.text()}`);
	}
	let status = (await res.json()) as StravaUploadStatus;

	for (let attempt = 0; attempt < UPLOAD_POLL_MAX_ATTEMPTS && status.activity_id == null && !status.error; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, UPLOAD_POLL_INTERVAL_MS));
		const pollRes = await fetch(`${UPLOADS_URL}/${status.id}`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!pollRes.ok) {
			throw new Error(`Strava upload status check failed: ${pollRes.status} ${await pollRes.text()}`);
		}
		status = (await pollRes.json()) as StravaUploadStatus;
	}

	if (status.error) {
		throw new Error(`Strava upload processing failed: ${status.error}`);
	}
	return status;
}
