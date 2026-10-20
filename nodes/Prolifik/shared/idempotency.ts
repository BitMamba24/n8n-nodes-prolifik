import { createHash, randomUUID } from 'crypto';

// What the API accepts (src/lib/public-api/idempotency.ts). It keeps a key's
// response for 24 hours per API key and refuses a key reused with other data.
export const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * How a repeat of a write is recognised:
 * - 'post': a public post (Publish Video, Publish Clip).
 * - 'job': anything that queues work (Create Clips, Create Videos, Add Content Source).
 */
export type DedupeKind = 'post' | 'job';

/** Where a write runs. n8n gives every run an execution ID, unlike Zapier. */
export interface IdempotencyScope {
	workflowId?: string;
	executionId?: string;
	itemIndex: number;
}

/** The value with object keys sorted, so equal requests hash equally. Arrays keep their order. */
export const canonical = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		const source = value as Record<string, unknown>;
		return Object.keys(source)
			.sort()
			.reduce(
				(out, key) => {
					out[key] = canonical(source[key]);
					return out;
				},
				{} as Record<string, unknown>,
			);
	}
	return value;
};

/**
 * An Idempotency-Key derived from the request, never random when it can be
 * derived, so a retry sends the same key and the API returns the first
 * response instead of doing the work twice.
 *
 * - 'post': the request alone. The same video or clip to the same accounts,
 *   caption and time is the same public post whichever workflow or execution
 *   sends it, so for the API's 24 hours a repeat gets the first post back
 *   instead of posting twice. A deliberate repost needs a changed caption or
 *   schedule time, or a retry in Prolifik.
 * - 'job': the request, the workflow, the execution and the item index. n8n's
 *   Retry On Fail re-runs the node inside the same execution, so it repeats
 *   the key and gets the first job back. A new execution (a schedule tick, a
 *   new trigger event) is new work and gets a new job, even with identical
 *   inputs, and two identical items in one execution are two jobs. Without an
 *   execution ID the key is random, so two runs never share a job.
 */
export const idempotencyKey = ({
	kind,
	method,
	path,
	body,
	scope,
}: {
	kind: DedupeKind;
	method: string;
	path: string;
	body: unknown;
	scope?: IdempotencyScope;
}): string => {
	if (kind !== 'post' && kind !== 'job') {
		throw new TypeError(`Every write needs an idempotency kind, got ${String(kind)}.`);
	}
	const executionId = scope?.executionId ? String(scope.executionId) : '';
	if (kind === 'job' && !executionId) return `n8n:job:${randomUUID()}`;
	const extra =
		kind === 'job'
			? [String(scope?.workflowId ?? ''), executionId, Number(scope?.itemIndex ?? 0)]
			: [];
	const digest = createHash('sha256')
		.update(JSON.stringify([method.toUpperCase(), path, canonical(body ?? {}), ...extra]))
		.digest('hex');
	return `n8n:${kind}:${digest}`;
};
