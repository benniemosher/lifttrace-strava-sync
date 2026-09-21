import { timingSafeEqual, createHmac } from 'node:crypto';

/**
 * Verify LiftTrace's webhook signature. LiftTrace signs the exact raw
 * JSON body bytes with HMAC-SHA256 over the webhook's shared secret and
 * sends it as `X-LiftTrace-Signature: sha256=<hex>` — verification MUST
 * run against the raw body text, not a re-serialized JSON.stringify of
 * the parsed object, or whitespace/key-order differences would break
 * every signature.
 */
export function verifyLiftTraceSignature(rawBody: string, header: string | null, secret: string): boolean {
	if (!header || !header.startsWith('sha256=')) return false;
	const given = header.slice('sha256='.length);
	const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

	// Constant-time comparison — a naive `given === expected` leaks
	// timing information about how many leading hex characters matched.
	const a = Buffer.from(given, 'hex');
	const b = Buffer.from(expected, 'hex');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
