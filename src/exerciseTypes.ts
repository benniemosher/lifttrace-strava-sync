/**
 * Exercise-name → Strava `exercise_type` map, for the structured
 * Set Messages JSON upload format (POST /uploads, data_type=json).
 * This is what actually renders Strava's muscle-map visualization —
 * the plain "Create an Activity" endpoint (used by buildStravaActivity
 * in strava.ts) has no set/exercise fields at all and never renders it,
 * confirmed against the real screenshots of this account's own past
 * Gravl-posted activities.
 *
 * Values are from Strava's published "Supported Exercises" catalog
 * (https://developers.strava.com/docs/uploads/), matched by hand
 * against what each of this LiftTrace instance's exercises actually
 * is. Exercises with no clean match fall back to the closest
 * `*_GENERIC` identifier rather than guessing at a specific variant
 * that might be wrong (e.g. an unspecific "Calf Raise (Machine)" maps
 * to CALF_RAISE_GENERIC, not a specific press-vs-extension machine
 * type this instance can't actually distinguish from the logged data).
 */
export const EXERCISE_TYPE_MAP: Record<string, string> = {
	// Push
	'Shoulder Press (Machine)': 'MACHINE_SEATED_SHOULDER_PRESS',
	'Chest Press': 'MACHINE_CHEST_PRESS',
	'Dumbbell Fly': 'DUMBBELL_CHEST_FLY',
	'Dumbbell Pullover': 'DUMBBELL_PULLOVER',
	'Dumbbell Shoulder Press': 'SEATED_DUMBBELL_SHOULDER_PRESS',
	'Dumbbell Lateral Raise': 'LATERAL_RAISE_GENERIC',
	'Tricep Press (Machine)': 'MACHINE_TRICEP_EXTENSION',
	'Tricep Pushdown (Cable, Straight Bar)': 'CABLE_TRICEPS_PUSHDOWN',
	'Incline Chest Press (Machine)': 'MACHINE_INCLINE_CHEST_PRESS',
	'Incline Dumbbell Bench Press': 'INCLINE_DUMBBELL_BENCH_PRESS',
	'Bicep Curl (Machine)': 'MACHINE_BICEP_CURL',

	// Pull
	'Rear Delt Fly (Machine)': 'MACHINE_REAR_DELT_REVERSE_FLY',
	'Lat Pulldown (Machine)': 'LAT_PULLDOWN',
	'Seated Row (Machine)': 'MACHINE_SEATED_ROW',
	'Seated Row (Chest-Supported Machine)': 'MACHINE_CHEST_SUPPORTED_ROW',
	'Seated Row (Single-Arm, Chest-Supported Machine)': 'MACHINE_SINGLE_ARM_SEATED_ROW',
	'Dumbbell Curl': 'STANDING_DUMBBELL_BICEPS_CURL',
	'Zottman Curl': 'DUMBBELL_ZOTTMAN_CURL',
	'Dumbbell Shrug': 'DUMBBELL_SHRUG',
	'Barbell Shrug': 'BARBELL_SHRUG',
	'Barbell Curl': 'BARBELL_BICEPS_CURL',

	// Legs
	'Leg Press': 'MACHINE_LEG_PRESS',
	'Leg Extension': 'MACHINE_LEG_EXTENSION',
	'Seated Leg Curl': 'MACHINE_LEG_CURL_SEATED',
	'Calf Raise (Machine)': 'CALF_RAISE_GENERIC',
	Adductor: 'MACHINE_HIP_ADDUCTION',
	'Hip Abductor (Machine)': 'MACHINE_HIP_ABDUCTION',
	'Squat (Smith Machine)': 'SMITH_MACHINE_SQUAT',
	'Romanian Deadlift (Smith Machine)': 'BARBELL_GOOD_MORNING',

	// Other / occasional
	'Back Extension (Machine)': 'MACHINE_BACK_EXTENSION',
	'Crunch (Machine)': 'AB_CRUNCH_MACHINE',
	Crunches: 'CRUNCH',
	'Dead Hang': 'DEAD_HANG',
	'Glute Kickback (Machine)': 'CABLE_KICKBACK',
	'Glute Machine': 'HIP_STABILITY_GENERIC',
	'Pec Deck / Chest Fly (Machine)': 'PEC_DECK_BUTTERFLY',
	'Preacher Curl (Machine)': 'PREACHER_CURL_MACHINE',
	'Torso Rotation (Machine)': 'CORE_GENERIC',
	'Assisted Chin-Up (Machine)': 'ASSISTED_CHIN_UP',
	Climbing: 'ROPE_CLIMB',

	// Deliberately NOT mapped: Walking, Running (Treadmill) — cardio, not
	// a strength exercise_type at all; no real Strava strength mapping
	// exists for either. Left out of this map on purpose so
	// buildSetMessages() skips them (see its own fallback), rather than
	// force-mapping to something misleading like CORE_GENERIC.
};
