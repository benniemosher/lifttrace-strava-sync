// Dev tool, not part of the deployed Worker. Prints exactly what
// buildStravaActivity() would send to Strava for a real workout
// payload — no network call, nothing posted anywhere. Usage:
//   npm run dry-run -- path/to/workout.json
// where workout.json is a GET /api/workout/:date response's `.workout`
// field (or the webhook's own `data` field — same shape).
import { readFileSync } from 'node:fs';
import { buildStravaActivity } from '../src/strava.ts';

const workout = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const activity = buildStravaActivity(workout, new Date().toISOString());
console.log(JSON.stringify(activity, null, 2));
