'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { DIST } = require('./helpers');
const { KEY_PATTERN, idempotencyKey } = require(`${DIST}/nodes/Prolifik/shared/idempotency.js`);

const body = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', numClips: 3 };
const scope = { workflowId: 'wf-1', executionId: 'exec-1', itemIndex: 0 };
const key = (overrides = {}) =>
	idempotencyKey({ kind: 'job', method: 'POST', path: '/clipper/jobs', body, scope, ...overrides });

describe('idempotency keys', () => {
	it('fits the pattern the API accepts', () => {
		assert.match(key(), KEY_PATTERN);
		assert.match(key({ kind: 'post' }), KEY_PATTERN);
		assert.match(key({ scope: { itemIndex: 0 } }), KEY_PATTERN);
	});

	it('repeats a job key when Retry On Fail re-runs the same execution', () => {
		assert.equal(key(), key());
		assert.match(key(), /^n8n:job:[0-9a-f]{64}$/);
	});

	it('gives a new job key to a new execution, another item or another workflow', () => {
		const first = key();
		assert.notEqual(key({ scope: { ...scope, executionId: 'exec-2' } }), first);
		assert.notEqual(key({ scope: { ...scope, itemIndex: 1 } }), first);
		assert.notEqual(key({ scope: { ...scope, workflowId: 'wf-2' } }), first);
	});

	it('never shares a job key when n8n gives no execution ID', () => {
		const a = key({ scope: { workflowId: 'wf-1', itemIndex: 0 } });
		const b = key({ scope: { workflowId: 'wf-1', itemIndex: 0 } });
		assert.notEqual(a, b);
		assert.match(a, /^n8n:job:[0-9a-f-]{36}$/);
	});

	it('keys a post on the request alone, in any workflow or execution', () => {
		const post = (overrides) =>
			idempotencyKey({
				kind: 'post',
				method: 'POST',
				path: '/content/pieces/v-1/publish',
				body: { connectionIds: ['a', 'b'], caption: 'Hi' },
				...overrides,
			});
		const first = post({ scope });
		assert.equal(post({ scope: { workflowId: 'wf-9', executionId: 'exec-9', itemIndex: 4 } }), first);
		assert.equal(post({}), first);
		assert.match(first, /^n8n:post:[0-9a-f]{64}$/);
		assert.notEqual(post({ body: { connectionIds: ['a', 'b'], caption: 'Hi!' } }), first);
		assert.notEqual(post({ body: { connectionIds: ['b', 'a'], caption: 'Hi' } }), first, 'list order counts');
	});

	it('ignores object key order but not values', () => {
		assert.equal(key({ body: { numClips: 3, url: body.url } }), key());
		assert.notEqual(key({ body: { ...body, numClips: 4 } }), key());
	});

	it('refuses a write without a dedupe kind', () => {
		assert.throws(() => key({ kind: undefined }), /idempotency kind/);
		assert.throws(() => key({ kind: 'random' }), /idempotency kind/);
	});
});
