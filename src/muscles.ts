/**
 * Static exercise-name → muscle-group map, sourced directly from this
 * LiftTrace instance's own exercise library (`primary_muscles` /
 * `secondary_muscles` columns) for every exercise across the current
 * Push/Pull/Legs templates — library-matched exercises already carried
 * this from their wger/free-db seed data; the custom exercises created
 * during the historical import didn't, and were backfilled by hand to
 * build this.
 *
 * Static rather than fetched live from LiftTrace's API on every webhook:
 * this whole routine is ~20 exercises and doesn't change often, so a
 * hardcoded map avoids needing PUBLIC_API_ENABLED turned on and a
 * second API token just for this. Falls back to omitting the
 * muscle-group line entirely for any exercise not in here (a program
 * change, a one-off exercise) rather than erroring — see buildStravaActivity.
 *
 * Re-run the export in TraceApps/lifttrace's exercises table
 * (primary_muscles/secondary_muscles) and update this file by hand if
 * the program's exercise list changes enough to be worth it.
 */
export const MUSCLE_MAP: Record<string, { primary: string[]; secondary: string[] }> = {
	'Shoulder Press (Machine)': { primary: ['Anterior deltoid'], secondary: ['Triceps brachii', 'Lateral deltoid'] },
	'Chest Press': { primary: ['Pectoralis major'], secondary: [] },
	'Dumbbell Fly': { primary: ['Pectorals'], secondary: ['Shoulders'] },
	'Dumbbell Pullover': { primary: ['Pectorals'], secondary: ['Latissimus Dorsi', 'Triceps'] },
	'Dumbbell Shoulder Press': { primary: ['Shoulders'], secondary: ['Triceps'] },
	'Dumbbell Lateral Raise': { primary: ['Anterior deltoid'], secondary: [] },
	'Tricep Press (Machine)': { primary: ['Triceps brachii'], secondary: [] },
	'Tricep Pushdown (Cable, Straight Bar)': { primary: ['Triceps brachii'], secondary: [] },
	'Rear Delt Fly (Machine)': { primary: ['Posterior deltoid'], secondary: ['Rhomboids', 'Trapezius'] },
	'Lat Pulldown (Machine)': { primary: ['Latissimus dorsi'], secondary: ['Biceps brachii', 'Rhomboids'] },
	'Seated Row (Machine)': { primary: ['Latissimus dorsi'], secondary: ['Anterior deltoid', 'Trapezius'] },
	'Seated Row (Single-Arm, Chest-Supported Machine)': {
		primary: ['Latissimus dorsi', 'Rhomboids'],
		secondary: ['Biceps brachii', 'Posterior deltoid'],
	},
	'Dumbbell Curl': { primary: ['Biceps brachii', 'Brachialis'], secondary: ['Anterior deltoid', 'Rectus abdominis'] },
	'Zottman Curl': { primary: ['Biceps'], secondary: ['Forearms'] },
	'Dumbbell Shrug': { primary: ['Traps'], secondary: [] },
	'Leg Press': { primary: ['Quadriceps'], secondary: ['Calves', 'Glutes', 'Hamstrings'] },
	'Leg Extension': { primary: ['Quadriceps femoris'], secondary: [] },
	'Seated Leg Curl': { primary: ['Hamstrings'], secondary: [] },
	'Calf Raise (Machine)': { primary: ['Gastrocnemius'], secondary: ['Soleus'] },
	Adductor: { primary: ['Adductors'], secondary: [] },
	'Hip Abductor (Machine)': { primary: ['Gluteus medius'], secondary: ['Tensor fasciae latae'] },
};

/** Unique primary muscles worked across a whole session, in first-seen
 * order. Exercises with no map entry are silently skipped, not errored. */
export function musclesWorked(exerciseNames: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const name of exerciseNames) {
		for (const m of MUSCLE_MAP[name]?.primary ?? []) {
			if (!seen.has(m)) {
				seen.add(m);
				out.push(m);
			}
		}
	}
	return out;
}
