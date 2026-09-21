// Secrets set via `wrangler secret put <NAME>` — deliberately absent from
// wrangler.jsonc (never commit secret values), so `wrangler types` doesn't
// know about them. Declared here instead; merges into the global `Env`
// interface worker-configuration.d.ts generates. Re-run `wrangler types`
// after editing wrangler.jsonc, but this file doesn't need touching.
interface Env {
	/** From your Strava API app registration (strava.com/settings/api). */
	STRAVA_CLIENT_SECRET: string;
	/** Must match the secret set when creating the webhook in LiftTrace Settings → Webhooks. */
	LIFTTRACE_WEBHOOK_SECRET: string;
}
