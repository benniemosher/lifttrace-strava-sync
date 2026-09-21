import { verifyLiftTraceSignature } from './hmac';
import type { LiftTraceWebhookEnvelope } from './lifttrace';
import {
	buildSetMessages,
	buildStravaActivity,
	createStravaActivity,
	exchangeCodeForTokens,
	getFreshAccessToken,
	saveTokens,
	uploadSetMessages,
} from './strava';

const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/' && request.method === 'GET') {
			return json({ ok: true, service: 'lifttrace-strava-sync' });
		}

		// ── One-time setup: authorize this relay against your Strava account ──
		if (url.pathname === '/oauth/start' && request.method === 'GET') {
			const redirectUri = new URL('/oauth/callback', url).toString();
			const authorizeUrl = new URL(STRAVA_AUTHORIZE_URL);
			authorizeUrl.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
			authorizeUrl.searchParams.set('redirect_uri', redirectUri);
			authorizeUrl.searchParams.set('response_type', 'code');
			authorizeUrl.searchParams.set('scope', 'activity:write');
			authorizeUrl.searchParams.set('approval_prompt', 'auto');
			return Response.redirect(authorizeUrl.toString(), 302);
		}

		if (url.pathname === '/oauth/callback' && request.method === 'GET') {
			const code = url.searchParams.get('code');
			const error = url.searchParams.get('error');
			if (error) return json({ error: `Strava denied authorization: ${error}` }, 400);
			if (!code) return json({ error: 'Missing ?code from Strava redirect' }, 400);

			try {
				const tokens = await exchangeCodeForTokens(code, env.STRAVA_CLIENT_ID, env.STRAVA_CLIENT_SECRET);
				await saveTokens(env.STRAVA_TOKENS, tokens);
				return json({ ok: true, message: 'Strava connected. This relay can now post workouts.' });
			} catch (e) {
				return json({ error: e instanceof Error ? e.message : String(e) }, 500);
			}
		}

		// ── LiftTrace webhook delivery ──────────────────────────────────────
		if (url.pathname === '/webhook' && request.method === 'POST') {
			const rawBody = await request.text();
			const signature = request.headers.get('X-LiftTrace-Signature');

			if (!verifyLiftTraceSignature(rawBody, signature, env.LIFTTRACE_WEBHOOK_SECRET)) {
				return json({ error: 'Invalid signature' }, 401);
			}

			let envelope: LiftTraceWebhookEnvelope;
			try {
				envelope = JSON.parse(rawBody);
			} catch {
				return json({ error: 'Malformed JSON body' }, 400);
			}

			// LiftTrace's test-webhook button sends event: "test" through this
			// same path — ack it without touching Strava so "Test" in Settings
			// actually validates signature + connectivity end to end.
			if (envelope.event === 'test') {
				return json({ ok: true, message: 'Signature verified, relay reachable.' });
			}

			if (envelope.event !== 'workout.completed') {
				return json({ ok: true, ignored: envelope.event });
			}
			if (!envelope.data?.logged) {
				return json({ ok: true, ignored: 'no workout logged for that date' });
			}

			try {
				const accessToken = await getFreshAccessToken(env.STRAVA_TOKENS, env.STRAVA_CLIENT_ID, env.STRAVA_CLIENT_SECRET);

				// Prefer the Set Messages upload — it's the only format Strava
				// renders as the visual muscle-map. Fall back to the plain
				// create-activity endpoint when none of the session's exercises
				// have a Strava exercise_type mapping (buildSetMessages returns
				// null), so a workout still gets posted either way.
				const setMessages = buildSetMessages(envelope.data, envelope.timestamp);
				if (setMessages) {
					const upload = await uploadSetMessages(accessToken, setMessages);
					return json({ ok: true, strava_upload: upload });
				}

				const activity = buildStravaActivity(envelope.data, envelope.timestamp);
				const created = await createStravaActivity(accessToken, activity);
				return json({ ok: true, strava_activity: created });
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				console.error('[lifttrace-strava-sync] webhook handling failed:', message);
				return json({ error: message }, 502);
			}
		}

		return json({ error: 'Not found' }, 404);
	},
} satisfies ExportedHandler<Env>;
