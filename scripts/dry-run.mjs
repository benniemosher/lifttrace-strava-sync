// Dev tool, not part of the deployed Worker. Prints exactly what the
// webhook handler would send to Strava for a real workout payload — no
// network call, nothing posted anywhere. Usage:
//   npm run dry-run -- path/to/workout.json
// where workout.json is a GET /api/workout/:date response's `.workout`
// field (or the webhook's own `data` field — same shape).
import { readFileSync } from 'node:fs';
import { buildSetMessages, buildStravaActivity } from '../src/strava.ts';

const workout = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const completedAt = new Date().toISOString();

const setMessages = buildSetMessages(workout, completedAt);
if (setMessages) {
	console.log('--- Set Messages upload (renders the muscle-map) ---');
	console.log(JSON.stringify(setMessages, null, 2));
} else {
	console.log('--- No exercise_type mapping for any exercise in this workout — would fall back to: ---');
	console.log(JSON.stringify(buildStravaActivity(workout, completedAt), null, 2));
}
