'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { BRAND, DIST, HOUR, MINUTE, apiError, isoAgo, poll, rejectionOf } = require('./helpers');
const { videoKey } = require(`${DIST}/nodes/Prolifik/shared/clips.js`);

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

/** A job as GET /clipper/jobs lists it. */
const listed = (id, { createdAgo, finishedAgo, status = 'completed', clips = 2, url = YT }) => ({
	job_id: id,
	status,
	num_clips: status === 'completed' ? clips : 0,
	source_url: url,
	created_at: isoAgo(createdAgo),
	completed_at: status === 'completed' ? isoAgo(finishedAgo) : null,
});

/** GET /clipper/jobs/{id} for a listed job. */
const detail = (job, count = 2) => ({
	job_id: job.job_id,
	status: job.status,
	completed_at: job.completed_at,
	created_at: job.created_at,
	aspect_ratio: '9:16',
	source: { url: job.source_url, title: 'Source', channel: 'Channel' },
	clips: Array.from({ length: count }, (_, n) => ({
		clip_id: `${job.job_id}-clip-${n + 1}`,
		title: `Clip ${n + 1}`,
		file_url: `https://clips.example.com/${job.job_id}-${n + 1}.mp4`,
		duration: 30,
		hashtags: ['shorts'],
		status: 'ready',
	})),
});

const jobsPage = (jobs, extra = {}) => ({
	method: 'GET',
	path: '/clipper/jobs',
	body: { jobs, hasMore: false, nextCursor: null, ...extra },
});
const open = (job, count) => ({
	method: 'GET',
	path: `/clipper/jobs/${job.job_id}`,
	body: detail(job, count),
});

const clipParams = (sourceUrl = '') => ({ event: 'newClip', sourceUrl });

describe('Prolifik Trigger', () => {
	describe('New Clip', () => {
		it('only records existing jobs on the first poll, then fires for jobs that finish later', async () => {
			const old = listed('old', { createdAgo: 3 * HOUR, finishedAgo: 2 * HOUR });
			const running = listed('run', { createdAgo: 20 * MINUTE, status: 'processing' });
			const staticData = {};

			const first = await poll({ params: clipParams(), staticData, script: [jobsPage([running, old])] });
			first.done();
			assert.equal(first.result, null);

			const finished = listed('run', { createdAgo: 20 * MINUTE, finishedAgo: MINUTE });
			const second = await poll({
				params: clipParams(),
				staticData,
				script: [jobsPage([finished, old]), open(finished, 2)],
			});
			second.done();
			assert.deepEqual(
				second.result[0].map((item) => item.json.id),
				['run-clip-1', 'run-clip-2'],
			);
			assert.equal(second.result[0][0].json.hashtags, '#shorts');
			assert.equal(second.result[0][0].json.source_url, YT);

			const third = await poll({ params: clipParams(), staticData, script: [jobsPage([finished, old])] });
			third.done();
			assert.equal(third.result, null, 'a poll with nothing new is one request and no items');
		});

		it('finds a long job that finished after newer jobs, without opening the old ones', async () => {
			const staticData = {};
			const longJob = listed('long', { createdAgo: 5 * HOUR, status: 'processing' });
			const newer = Array.from({ length: 12 }, (_, n) =>
				listed(`new-${n}`, { createdAgo: (n + 1) * MINUTE, finishedAgo: n * MINUTE }),
			);
			await poll({ params: clipParams(), staticData, script: [jobsPage([...newer, longJob])] });

			const done = listed('long', { createdAgo: 5 * HOUR, finishedAgo: 0 });
			const { result } = await poll({
				params: clipParams(),
				staticData,
				script: [jobsPage([...newer, done]), open(done, 1)],
			});
			assert.deepEqual(result[0].map((item) => item.json.id), ['long-clip-1']);
		});

		it('pages back past a full page to reach a long job that just finished', async () => {
			const staticData = { newClip: { seeded: true, seenJobs: [] } };
			const page1 = Array.from({ length: 100 }, (_, n) =>
				listed(`p1-${n}`, { createdAgo: HOUR, status: 'failed' }),
			);
			const longJob = listed('long', { createdAgo: 6 * HOUR, finishedAgo: MINUTE });
			const { result, done } = await poll({
				params: clipParams(),
				staticData,
				script: [
					jobsPage(page1, { hasMore: true, nextCursor: 'cursor-1' }),
					{ ...jobsPage([longJob]), query: { limit: 100, before: 'cursor-1' } },
					open(longJob, 1),
				],
			});
			done();
			assert.equal(result[0][0].json.id, 'long-clip-1');
		});

		it('reads at most three pages of jobs per poll', async () => {
			const staticData = {};
			const page = (n) =>
				jobsPage(
					Array.from({ length: 100 }, (_, i) => listed(`p${n}-${i}`, { createdAgo: MINUTE, status: 'failed' })),
					{ hasMore: true, nextCursor: `c${n}` },
				);
			const { done } = await poll({ params: clipParams(), staticData, script: [page(1), page(2), page(3)] });
			done();
		});

		it('opens at most 25 jobs a poll, oldest finished first, and the rest on the next poll', async () => {
			const staticData = { newClip: { seeded: true, seenJobs: [] } };
			const jobs = Array.from({ length: 30 }, (_, n) =>
				listed(`j${String(n).padStart(2, '0')}`, { createdAgo: HOUR, finishedAgo: (30 - n) * MINUTE }),
			);
			const first = await poll({
				params: clipParams(),
				staticData,
				script: [jobsPage(jobs), ...jobs.slice(0, 25).map((job) => open(job, 1))],
			});
			first.done();
			assert.equal(first.result[0].length, 25);
			assert.equal(first.result[0][0].json.id, 'j00-clip-1');

			const second = await poll({
				params: clipParams(),
				staticData,
				script: [jobsPage(jobs), ...jobs.slice(25).map((job) => open(job, 1))],
			});
			second.done();
			assert.deepEqual(
				second.result[0].map((item) => item.json.job_id),
				['j25', 'j26', 'j27', 'j28', 'j29'],
			);
		});

		it('keeps only clips from the chosen source video, matching any YouTube link form', async () => {
			const staticData = { newClip: { seeded: true, seenJobs: [] } };
			const match = listed('match', { createdAgo: HOUR, finishedAgo: MINUTE, url: YT });
			const other = listed('other', {
				createdAgo: HOUR,
				finishedAgo: MINUTE,
				url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
			});
			const { result, done } = await poll({
				params: clipParams('youtu.be/dQw4w9WgXcQ?t=42'),
				staticData,
				script: [jobsPage([match, other]), open(match, 1)],
			});
			done();
			assert.deepEqual(result[0].map((item) => item.json.job_id), ['match']);
			assert.ok(staticData.newClip.seenJobs.includes('other'), 'a job from another video is settled');
		});

		it('skips a job deleted between the list and the detail read', async () => {
			const staticData = { newClip: { seeded: true, seenJobs: [] } };
			const gone = listed('gone', { createdAgo: HOUR, finishedAgo: 2 * MINUTE });
			const kept = listed('kept', { createdAgo: HOUR, finishedAgo: MINUTE });
			const { result } = await poll({
				params: clipParams(),
				staticData,
				script: [
					jobsPage([kept, gone]),
					{ method: 'GET', path: '/clipper/jobs/gone', status: 404, body: apiError('not_found', 'Job not found.') },
					open(kept, 1),
				],
			});
			assert.deepEqual(result[0].map((item) => item.json.job_id), ['kept']);
			assert.ok(staticData.newClip.seenJobs.includes('gone'));
		});

		it('keeps its memory when a detail read fails, so the next poll tries again', async () => {
			const before = { seeded: true, seenJobs: ['a'] };
			const staticData = { newClip: before };
			const job = listed('new', { createdAgo: HOUR, finishedAgo: MINUTE });
			const error = await rejectionOf(
				poll({
					params: clipParams(),
					staticData,
					script: [
						jobsPage([job]),
						{ method: 'GET', path: '/clipper/jobs/new', status: 500, body: apiError('server_error', 'Boom.') },
					],
				}),
			);
			assert.equal(error.name, 'NodeApiError');
			assert.equal(staticData.newClip, before);
		});

		it('shows the newest finished job in a manual test without touching its memory', async () => {
			const staticData = {};
			const newest = listed('newest', { createdAgo: 2 * HOUR, finishedAgo: MINUTE });
			const older = listed('older', { createdAgo: HOUR, finishedAgo: 30 * MINUTE });
			const { result, done } = await poll({
				mode: 'manual',
				params: clipParams(),
				staticData,
				script: [jobsPage([older, newest]), open(newest, 2)],
			});
			done();
			assert.deepEqual(result[0].map((item) => item.json.job_id), ['newest', 'newest']);
			assert.deepEqual(staticData, {});
		});

		it('explains an empty manual test', async () => {
			const error = await rejectionOf(
				poll({ mode: 'manual', params: clipParams(), script: [jobsPage([])] }),
			);
			assert.match(error.message, /No finished clips found yet/);
		});

		it('gives every link form of one video the same key', () => {
			const youtube = [
				YT,
				'youtube.com/watch?v=dQw4w9WgXcQ&t=10',
				'https://youtu.be/dQw4w9WgXcQ',
				'https://m.youtube.com/shorts/dQw4w9WgXcQ',
				'https://www.youtube.com/live/dQw4w9WgXcQ?si=x',
			];
			youtube.forEach((link) => assert.equal(videoKey(link), 'youtube:dQw4w9WgXcQ', link));
			assert.equal(videoKey('https://www.twitch.tv/videos/123456'), 'twitch:vod:123456');
			assert.equal(videoKey('https://player.twitch.tv/?video=v123456'), 'twitch:vod:123456');
			assert.equal(
				videoKey('https://kick.com/streamer/videos/01a07913-aaaa-bbbb-cccc-1234567890ab'),
				'kick:vod:01a07913-aaaa-bbbb-cccc-1234567890ab',
			);
			assert.equal(videoKey('https://Example.com/Talk/?x=1'), 'example.com/talk');
		});
	});

	describe('New Video', () => {
		const piece = (id, extra = {}) => ({
			id,
			jobId: 'job-1',
			format: 'b-roll',
			status: 'ready',
			videoUrl: `https://media.example.com/${id}.mp4`,
			script: { hook: `Hook ${id}` },
			createdAt: '2026-10-12T14:39:16.893Z',
			...extra,
		});
		const pieces = (list, query) => ({
			method: 'GET',
			path: '/content/pieces',
			query,
			body: { pieces: list },
		});
		const params = (values = {}) => ({ event: 'newVideo', brandId: '', format: '', ...values });

		it('records rendered videos on the first poll and fires for new ones, oldest first', async () => {
			const staticData = {};
			const first = await poll({
				params: params(),
				staticData,
				script: [pieces([piece('v2'), piece('v1')], { status: 'ready', limit: 50 })],
			});
			assert.equal(first.result, null);

			const second = await poll({
				params: params(),
				staticData,
				script: [pieces([piece('v4'), piece('v3'), piece('v2'), piece('v1')])],
			});
			assert.deepEqual(second.result[0].map((item) => item.json.id), ['v3', 'v4']);
			assert.equal(second.result[0][0].json.format_label, 'B-Roll Montage');
			assert.equal(second.result[0][0].json.hook, 'Hook v3');

			const third = await poll({ params: params(), staticData, script: [pieces([piece('v4'), piece('v3')])] });
			assert.equal(third.result, null);
		});

		it('filters by brand and format, and re-seeds when the filters change', async () => {
			const staticData = {};
			await poll({ params: params(), staticData, script: [pieces([piece('v1')])] });
			const { result } = await poll({
				params: params({ brandId: BRAND, format: 'carousel' }),
				staticData,
				script: [
					pieces([piece('c1', { format: 'carousel' })], {
						status: 'ready',
						limit: 50,
						brandId: BRAND,
						format: 'carousel',
					}),
				],
			});
			assert.equal(result, null, 'old videos of the new filter do not fire');
		});

		it('shows the newest video in a manual test', async () => {
			const { result } = await poll({
				mode: 'manual',
				params: params(),
				script: [pieces([piece('v9')], { status: 'ready', limit: 1 })],
			});
			assert.deepEqual(result[0].map((item) => item.json.id), ['v9']);
		});
	});
});
