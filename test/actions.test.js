'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
	ACCOUNT,
	ACCOUNT_2,
	BRAND,
	DIST,
	apiError,
	execute,
	rejectionOf,
} = require('./helpers');
const { KEY_PATTERN } = require(`${DIST}/nodes/Prolifik/shared/idempotency.js`);

const keyOf = (call) => call.headers['Idempotency-Key'];

const job = { job_id: '3f9c2a7be41d', status: 'queued', created_at: '2026-10-12T14:02:44.000Z' };
const contentJob = {
	job: {
		id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
		brandId: BRAND,
		contentSourceId: null,
		format: 'b-roll',
		status: 'queued',
		requestedPieces: 3,
		expectedPieces: null,
		includeLogo: true,
		mentionBrand: true,
		createdAt: '2026-10-12T14:20:05.000Z',
	},
};
const publishResponse = {
	publish: {
		id: 'f0e1d2c3-b4a5-4968-8776-655443322110',
		contentPieceId: 'a3c1e7d2-5b8f-4e0a-9c6d-1f2b3c4d5e6f',
		status: 'scheduled',
		platforms: ['tiktok', 'instagram'],
		connectionIds: [ACCOUNT, ACCOUNT_2],
		caption: '',
		hashtags: ['coldbrew', '#coffeetok'],
		scheduledAt: '2026-10-14T09:00:00.000Z',
		postedAt: null,
		aiGenerated: false,
		createdAt: '2026-10-12T14:45:02.000Z',
	},
};
const clipPublishRecord = {
	id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
	clip_id: 'clip-1',
	job_id: '3f9c2a7be41d',
	account_id: ACCOUNT,
	platform: 'youtube',
	account_handle: 'acmecoffee',
	title: 'Title',
	description: 'Title\n\nBody',
	status: 'pending',
	scheduled_for: null,
	published_at: '2026-10-12T14:50:30.000Z',
	completed_at: null,
};

const clipCreate = (extra = {}, base = {}) => ({
	resource: 'clip',
	operation: 'create',
	videoUrl: ' https://www.youtube.com/watch?v=dQw4w9WgXcQ ',
	additionalFields: extra,
	...base,
});

const videoCreate = (values = {}) => ({
	resource: 'video',
	operation: 'create',
	brandId: BRAND,
	format: 'b-roll',
	count: 3,
	additionalFields: {},
	...values,
});

const texts = (...entries) => ({ texts: entries.map((text) => ({ text })) });

const videoPublish = (values = {}) => ({
	resource: 'video',
	operation: 'publish',
	brandId: BRAND,
	videoId: 'a3c1e7d2-5b8f-4e0a-9c6d-1f2b3c4d5e6f',
	destinationIds: [ACCOUNT, ACCOUNT_2],
	caption: '',
	hashtags: '',
	additionalFields: {},
	...values,
});

describe('Prolifik node', () => {
	describe('Clip > Create', () => {
		it('sends the clip settings in the API shape with the API credential', async () => {
			const { output, calls, credentials, done } = await execute({
				params: clipCreate({
					clipCount: 5,
					clipLength: '30-60',
					videoType: 'podcast',
					language: 'lt',
					captionStyle: 'karaoke',
					layout: 'smart',
					aspectRatio: '1:1',
					instructions: 'only the product demo parts',
				}),
				script: [{ method: 'POST', path: '/clipper/jobs', body: job }],
			});
			done();
			assert.deepEqual(credentials, ['prolifikApi']);
			assert.deepEqual(calls[0].body, {
				url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
				numClips: 5,
				minDuration: 30,
				maxDuration: 60,
				captionStyle: 'karaoke',
				layout: 'smart',
				aspectRatio: '1:1',
				userPrompt: 'only the product demo parts',
				options: { language: 'lt', format: 'podcast' },
			});
			assert.match(keyOf(calls[0]), KEY_PATTERN);
			assert.deepEqual(output, [
				{
					json: {
						id: '3f9c2a7be41d',
						status: 'queued',
						created_at: '2026-10-12T14:02:44.000Z',
						video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
					},
					pairedItem: { item: 0 },
				},
			]);
		});

		it('sends only the URL when no additional fields are set', async () => {
			const { calls } = await execute({
				params: clipCreate(),
				script: [{ method: 'POST', path: '/clipper/jobs', body: job }],
			});
			assert.deepEqual(calls[0].body, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
		});

		it('surfaces the API message for an unsupported link', async () => {
			const error = await rejectionOf(
				execute({
					params: clipCreate({}, { videoUrl: 'https://vimeo.com/1' }),
					script: [
						{
							method: 'POST',
							path: '/clipper/jobs',
							status: 400,
							body: apiError('invalid_request', 'Only YouTube, Twitch and Kick links are supported.'),
						},
					],
				}),
			);
			assert.equal(error.name, 'NodeApiError');
			assert.equal(error.message, 'Only YouTube, Twitch and Kick links are supported');
			assert.equal(error.httpCode, '400');
			assert.equal(error.context.itemIndex, 0);
		});

		it('turns an empty clip-minute balance into a plan error with the upgrade link', async () => {
			const error = await rejectionOf(
				execute({
					params: clipCreate(),
					script: [
						{
							method: 'POST',
							path: '/clipper/jobs',
							status: 402,
							body: apiError('clip_minutes_exhausted', 'You have used all your clip minutes this month.', {
								upgradeUrl: 'https://app.getprolifik.com/pricing?from=api',
							}),
						},
					],
				}),
			);
			assert.equal(error.message, 'You have used all your clip minutes this month');
			assert.equal(error.description, 'Plans and limits: https://app.getprolifik.com/pricing?from=api');
		});

		it('refuses a non-numeric clip count before calling the API', async () => {
			const error = await rejectionOf(execute({ params: clipCreate({ clipCount: 'many' }) }));
			assert.equal(error.name, 'NodeOperationError');
			assert.match(error.message, /Number of Clips must be a whole number/);
		});
	});

	describe('Video > Create', () => {
		it('sends the job with the filters the format accepts', async () => {
			const { output, calls } = await execute({
				params: videoCreate({
					audioMood: 'chill',
					personTags: ['Woman', 'Man'],
					additionalFields: { includeLogo: true, mentionBrand: false, contentSourceId: 'src-1' },
				}),
				script: [{ method: 'POST', path: '/content/jobs', body: contentJob }],
			});
			assert.deepEqual(calls[0].body, {
				brandId: BRAND,
				format: 'b-roll',
				count: 3,
				contentSourceId: 'src-1',
				includeLogo: true,
				mentionBrand: false,
				assetFilters: { audioMood: 'chill', personTags: ['Woman', 'Man'] },
			});
			assert.equal(output[0].json.format_label, 'B-Roll Montage');
			assert.equal(output[0].json.requested_videos, 3);
		});

		it('drops filters a format does not take', async () => {
			const { calls } = await execute({
				params: videoCreate({ format: 'caption-card', audioMood: 'chill', personTags: ['Woman'] }),
				script: [{ method: 'POST', path: '/content/jobs', body: contentJob }],
			});
			assert.equal(calls[0].body.assetFilters, undefined);
			assert.equal(calls[0].body.format, 'caption-card');
		});

		it('keeps each custom text on its own video when entries are blank', async () => {
			const { calls } = await execute({
				params: videoCreate({ count: 4, customTexts: texts('First', '', '  ', 'Fourth', '', '') }),
				script: [{ method: 'POST', path: '/content/jobs', body: contentJob }],
			});
			assert.deepEqual(calls[0].body.customTexts, [
				{ text: 'First' },
				null,
				null,
				{ text: 'Fourth' },
			]);
		});

		it('splits carousel slides and keeps slide sets on their own videos', async () => {
			const { calls } = await execute({
				params: videoCreate({
					format: 'carousel',
					count: 3,
					customTexts: texts('', 'One | Two |  | Three'),
				}),
				script: [{ method: 'POST', path: '/content/jobs', body: contentJob }],
			});
			assert.deepEqual(calls[0].body.customTexts, [null, { slides: ['One', 'Two', 'Three'] }]);
		});

		it('leaves customTexts out when every entry is blank', async () => {
			const { calls } = await execute({
				params: videoCreate({ customTexts: texts('', ' ') }),
				script: [{ method: 'POST', path: '/content/jobs', body: contentJob }],
			});
			assert.equal('customTexts' in calls[0].body, false);
		});

		it('refuses more custom texts than videos before calling the API', async () => {
			const error = await rejectionOf(
				execute({ params: videoCreate({ count: 1, customTexts: texts('a', 'b') }) }),
			);
			assert.equal(error.name, 'NodeOperationError');
			assert.match(error.message, /entry for video 2, but Number of Videos is 1/);
		});

		it('sends the demo and hook videos for Video Hook & Demo only', async () => {
			const { calls } = await execute({
				params: [
					videoCreate({
						format: 'talking-head',
						count: 1,
						demoVideoKey: 'uploads/u/demo.mp4',
						hookVideoKey: 'uploads/u/hook.mp4',
						audioMood: 'upbeat',
					}),
					videoCreate({ format: 'b-roll', demoVideoKey: 'uploads/u/demo.mp4' }),
				],
				script: [
					{ method: 'POST', path: '/content/jobs', body: contentJob },
					{ method: 'POST', path: '/content/jobs', body: contentJob },
				],
			});
			assert.equal(calls[0].body.demoVideoKey, 'uploads/u/demo.mp4');
			assert.equal(calls[0].body.hookVideoKey, 'uploads/u/hook.mp4');
			assert.deepEqual(calls[0].body.assetFilters, { audioMood: 'upbeat' });
			assert.equal(calls[1].body.demoVideoKey, undefined);
		});

		it('passes the trial trim notice through', async () => {
			const { output } = await execute({
				params: videoCreate(),
				script: [
					{
						method: 'POST',
						path: '/content/jobs',
						body: { ...contentJob, notice: 'Your trial allows 2 more videos, so 2 will be made.' },
					},
				],
			});
			assert.equal(output[0].json.notice, 'Your trial allows 2 more videos, so 2 will be made.');
		});
	});

	describe('Content Source > Add', () => {
		it('adds the page to the brand', async () => {
			const { output, calls } = await execute({
				params: {
					resource: 'contentSource',
					operation: 'add',
					brandId: BRAND,
					url: 'https://acmecoffee.com/blog/cold-brew-ratios ',
					additionalFields: { title: 'Ratios' },
				},
				script: [
					{
						method: 'POST',
						path: '/content/sources',
						status: 201,
						body: { source: { id: 'src-1', brandId: BRAND, status: 'pending' } },
					},
				],
			});
			assert.deepEqual(calls[0].body, {
				brandId: BRAND,
				url: 'https://acmecoffee.com/blog/cold-brew-ratios',
				title: 'Ratios',
			});
			assert.match(keyOf(calls[0]), /^n8n:job:/);
			assert.equal(output[0].json.id, 'src-1');
			assert.equal(output[0].json.status, 'pending');
		});
	});

	describe('Video > Publish', () => {
		it('publishes to every picked account and keeps an empty caption', async () => {
			const { output, calls } = await execute({
				params: videoPublish({
					hashtags: 'coldbrew, #coffeetok  tips',
					additionalFields: { scheduledAt: '2026-10-14T09:00:00.000Z', aiGenerated: false },
				}),
				script: [
					{
						method: 'POST',
						path: '/content/pieces/a3c1e7d2-5b8f-4e0a-9c6d-1f2b3c4d5e6f/publish',
						body: publishResponse,
					},
				],
			});
			assert.deepEqual(calls[0].body, {
				brandId: BRAND,
				connectionIds: [ACCOUNT, ACCOUNT_2],
				caption: '',
				hashtags: ['coldbrew', '#coffeetok', 'tips'],
				scheduledAt: '2026-10-14T09:00:00.000Z',
				aiGenerated: false,
			});
			assert.match(keyOf(calls[0]), /^n8n:post:/);
			assert.equal(output[0].json.hashtags, '#coldbrew #coffeetok');
			assert.deepEqual(output[0].json.destination_ids, [ACCOUNT, ACCOUNT_2]);
		});

		it('sends a whitespace-only caption as an empty one', async () => {
			const { calls } = await execute({
				params: videoPublish({ caption: '   ' }),
				script: [{ method: 'POST', path: '/content/pieces/a3c1e7d2-5b8f-4e0a-9c6d-1f2b3c4d5e6f/publish', body: publishResponse }],
			});
			assert.equal(calls[0].body.caption, '');
		});

		it('accepts account IDs set by an expression as one comma-separated value', async () => {
			const { calls } = await execute({
				params: videoPublish({ destinationIds: `${ACCOUNT}, ${ACCOUNT_2}` }),
				script: [{ method: 'POST', path: '/content/pieces/a3c1e7d2-5b8f-4e0a-9c6d-1f2b3c4d5e6f/publish', body: publishResponse }],
			});
			assert.deepEqual(calls[0].body.connectionIds, [ACCOUNT, ACCOUNT_2]);
		});

		it('requires at least one account', async () => {
			const error = await rejectionOf(execute({ params: videoPublish({ destinationIds: [] }) }));
			assert.match(error.message, /Pick at least one social account/);
		});

		it('explains a missing publish scope', async () => {
			const error = await rejectionOf(
				execute({
					params: videoPublish(),
					script: [
						{
							method: 'POST',
							path: '/content/pieces/a3c1e7d2-5b8f-4e0a-9c6d-1f2b3c4d5e6f/publish',
							status: 403,
							body: apiError('insufficient_scope', 'This API key lacks the publish:write scope.'),
						},
					],
				}),
			);
			assert.equal(error.message, 'This API key lacks the publish:write scope');
			assert.match(error.description, /clipper:read, clipper:write, content:read, content:write, publish:write/);
		});
	});

	describe('Clip > Publish', () => {
		const params = (values = {}) => ({
			resource: 'clip',
			operation: 'publish',
			brandId: '',
			clipId: 'clip-1',
			destinationId: ACCOUNT,
			additionalFields: {},
			...values,
		});

		it('publishes the clip to the picked account when no brand is chosen', async () => {
			const { output, calls } = await execute({
				params: params({ additionalFields: { scheduledFor: '2026-12-31T09:00:00.000Z' } }),
				script: [{ method: 'POST', path: '/clipper/clips/clip-1/publish', body: clipPublishRecord }],
			});
			assert.deepEqual(calls[0].body, {
				connectionId: ACCOUNT,
				scheduledFor: '2026-12-31T09:00:00.000Z',
			});
			assert.match(keyOf(calls[0]), /^n8n:post:/);
			assert.equal(output[0].json.destination_id, ACCOUNT);
			assert.equal(output[0].json.caption, 'Title\n\nBody');
		});

		it("posts only to one of the chosen brand's accounts", async () => {
			const { calls, done } = await execute({
				params: params({ brandId: BRAND }),
				script: [
					{
						method: 'GET',
						path: '/clipper/publish-destinations',
						query: { brandId: BRAND },
						body: { destinations: [{ id: ACCOUNT, platform: 'youtube' }] },
					},
					{ method: 'POST', path: '/clipper/clips/clip-1/publish', body: clipPublishRecord },
				],
			});
			done();
			assert.equal(calls.length, 2);
		});

		it("refuses an account that is not one of the chosen brand's", async () => {
			const error = await rejectionOf(
				execute({
					params: params({ brandId: BRAND }),
					script: [
						{
							method: 'GET',
							path: '/clipper/publish-destinations',
							body: { destinations: [{ id: ACCOUNT_2, platform: 'tiktok' }] },
						},
					],
				}),
			);
			assert.equal(error.name, 'NodeOperationError');
			assert.match(error.message, /not connected to the brand you picked/);
		});
	});

	describe('Brand > Find', () => {
		const brands = {
			brands: [
				{ id: 'b-1', name: 'Acme Coffee Roasters', isActive: true },
				{ id: 'b-2', name: 'Acme Coffee', isActive: false },
				{ id: 'b-3', name: 'Acme Coffee', isActive: true },
				{ id: 'b-4', name: 'The Acme Coffee Club', isActive: true },
			],
		};

		it('returns the exact name first, a usable brand before a locked one', async () => {
			const { output } = await execute({
				params: { resource: 'brand', operation: 'find', brandName: ' acme coffee ' },
				script: [{ method: 'GET', path: '/brands', body: brands }],
			});
			assert.equal(output.length, 1);
			assert.equal(output[0].json.id, 'b-3');
			assert.equal(output[0].json.is_active, true);
		});

		it('returns no item when nothing matches', async () => {
			const { output } = await execute({
				params: { resource: 'brand', operation: 'find', brandName: 'Globex' },
				script: [{ method: 'GET', path: '/brands', body: brands }],
			});
			assert.deepEqual(output, []);
		});
	});

	describe('errors', () => {
		it('turns a 401 into a clear invalid-key error', async () => {
			const error = await rejectionOf(
				execute({
					params: { resource: 'brand', operation: 'find', brandName: 'Acme' },
					script: [{ method: 'GET', path: '/brands', status: 401, body: apiError('unauthorized', 'Invalid API key.') }],
				}),
			);
			assert.equal(error.message, 'Your Prolifik API key is invalid, expired or revoked');
			assert.match(error.description, /Settings > Developer API/);
		});

		it("passes the API's 429 message and Retry-After on", async () => {
			const error = await rejectionOf(
				execute({
					params: clipCreate(),
					script: [
						{
							method: 'POST',
							path: '/clipper/jobs',
							status: 429,
							headers: { 'Retry-After': '42' },
							body: apiError('rate_limited', 'You can queue 10 clip jobs an hour.'),
						},
					],
				}),
			);
			assert.equal(error.message, 'You can queue 10 clip jobs an hour');
			assert.match(error.description, /Retry after 42 seconds/);
			assert.match(error.description, /Retry On Fail/);
		});

		it('says a write is still processing when the same key is in flight', async () => {
			const error = await rejectionOf(
				execute({
					params: clipCreate(),
					script: [
						{
							method: 'POST',
							path: '/clipper/jobs',
							status: 409,
							headers: { 'retry-after': '2' },
							body: apiError('idempotency_in_progress', 'idempotency_in_progress'),
						},
					],
				}),
			);
			assert.equal(error.message, 'Prolifik is still processing this step');
			assert.match(error.description, /Retry after 2 seconds/);
		});

		it('turns a bare error code into a readable message and keeps a plain conflict', async () => {
			const error = await rejectionOf(
				execute({
					params: clipCreate(),
					script: [{ method: 'POST', path: '/clipper/jobs', status: 409, body: apiError('conflict', 'connection_locked') }],
				}),
			);
			assert.equal(error.message, 'Prolifik rejected the request (HTTP 409)');
		});

		it('reports a server error with its request ID', async () => {
			const error = await rejectionOf(
				execute({
					params: clipCreate(),
					script: [{ method: 'POST', path: '/clipper/jobs', status: 503, body: apiError('server_error', '') }],
				}),
			);
			assert.match(error.message, /Prolifik is having trouble right now \(HTTP 503\)/);
			assert.equal(error.description, 'Request ID: req_test');
		});

		it('returns the error as an item with Continue On Fail and carries on', async () => {
			const { output } = await execute({
				continueOnFail: true,
				params: [clipCreate({ clipCount: 'many' }), clipCreate()],
				script: [{ method: 'POST', path: '/clipper/jobs', body: job }],
			});
			assert.equal(output.length, 2);
			assert.match(output[0].json.error, /whole number/);
			assert.deepEqual(output[0].pairedItem, { item: 0 });
			assert.equal(output[1].json.id, '3f9c2a7be41d');
			assert.deepEqual(output[1].pairedItem, { item: 1 });
		});
	});

	describe('idempotency keys on writes', () => {
		const writes = [
			[clipCreate(), { method: 'POST', path: '/clipper/jobs', body: job }, 'job'],
			[videoCreate(), { method: 'POST', path: '/content/jobs', body: contentJob }, 'job'],
			[
				{ resource: 'contentSource', operation: 'add', brandId: BRAND, url: 'https://a.com', additionalFields: {} },
				{ method: 'POST', path: '/content/sources', body: { source: { id: 's' } } },
				'job',
			],
			[
				videoPublish(),
				{ method: 'POST', path: '/content/pieces/a3c1e7d2-5b8f-4e0a-9c6d-1f2b3c4d5e6f/publish', body: publishResponse },
				'post',
			],
			[
				{ resource: 'clip', operation: 'publish', brandId: '', clipId: 'clip-1', destinationId: ACCOUNT, additionalFields: {} },
				{ method: 'POST', path: '/clipper/clips/clip-1/publish', body: clipPublishRecord },
				'post',
			],
		];

		it('sends a derived key of the right kind on every write', async () => {
			for (const [params, response, kind] of writes) {
				const { calls } = await execute({ params, script: [response] });
				assert.match(keyOf(calls[0]), KEY_PATTERN);
				assert.match(keyOf(calls[0]), new RegExp(`^n8n:${kind}:[0-9a-f]{64}$`));
			}
		});

		it('repeats every key when Retry On Fail runs the node again in one execution', async () => {
			for (const [params, response] of writes) {
				const first = await execute({ params, script: [response] });
				const retry = await execute({ params, script: [response] });
				assert.equal(keyOf(retry.calls[0]), keyOf(first.calls[0]));
			}
		});

		it('creates a new job, but never a second post, in a new execution', async () => {
			const jobs = [];
			const posts = [];
			for (const executionId of ['exec-1', 'exec-2']) {
				jobs.push((await execute({ executionId, params: clipCreate(), script: [writes[0][1]] })).calls[0]);
				posts.push((await execute({ executionId, params: videoPublish(), script: [writes[3][1]] })).calls[0]);
			}
			assert.notEqual(keyOf(jobs[0]), keyOf(jobs[1]));
			assert.equal(keyOf(posts[0]), keyOf(posts[1]));
		});

		it('gives identical items in one execution their own jobs', async () => {
			const { calls } = await execute({
				params: [clipCreate(), clipCreate()],
				script: [writes[0][1], writes[0][1]],
			});
			assert.notEqual(keyOf(calls[0]), keyOf(calls[1]));
		});
	});
});
