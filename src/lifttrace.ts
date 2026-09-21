/** Shapes matching LiftTrace's getWorkoutCore() — the payload shape shared
 * by GET /api/v1/workouts/:date, the MCP get_workout tool, and the
 * workout.completed webhook's `data` field. See server/lib/mcp/tools/get-workout.js
 * in TraceApps/lifttrace. */

export interface LiftTraceSet {
	reps: number | null;
	weight: number | null;
	completed: boolean;
	warmup: boolean;
	rpe: number | null;
	duration_sec: number | null;
}

export interface LiftTraceExercise {
	exercise_id: number | null;
	exercise_name: string;
	superset_id: number | null;
	set_type: string | null;
	sets: LiftTraceSet[];
}

export interface LiftTraceWorkout {
	date: string;
	logged: boolean;
	name: string | null;
	completed: boolean;
	duration_min: number | null;
	exercises: LiftTraceExercise[];
}

export interface LiftTraceWebhookEnvelope {
	event: string;
	timestamp: string;
	data: LiftTraceWorkout;
}
