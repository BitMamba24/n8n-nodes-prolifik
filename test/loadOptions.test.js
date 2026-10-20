'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ACCOUNT, ACCOUNT_2, BRAND, BRAND_2, loadOptions } = require('./helpers');

const brands = {
	brands: [
		{ id: BRAND, name: 'Old Brand', isActive: false },
		{ id: BRAND_2, name: 'Acme Coffee', isActive: true },
	],
	activeBrandId: BRAND_2,
};

describe('dropdowns', () => {
	it('lists brands newest first and marks plan-locked brands', async () => {
		const { result } = await loadOptions('getBrands', {
			script: [{ method: 'GET', path: '/brands', body: brands }],
		});
		assert.deepEqual(result, [
			{ name: 'Acme Coffee', value: BRAND_2 },
			{ name: 'Old Brand (locked by your plan)', value: BRAND },
		]);
	});

	it("lists the picked brand's social accounts with their platform", async () => {
		const { result, done } = await loadOptions('getDestinations', {
			params: { brandId: BRAND },
			script: [
				{
					method: 'GET',
					path: '/publish-destinations',
					query: { brandId: BRAND },
					body: { destinations: [{ id: ACCOUNT, platform: 'tiktok', accountName: 'acmecoffee' }] },
				},
			],
		});
		done();
		assert.deepEqual(result, [{ name: 'acmecoffee (TikTok)', value: ACCOUNT }]);
	});

	it('lists every brand, labelled, when the Brand is an expression', async () => {
		const both = { brands: brands.brands.map((brand) => ({ ...brand, isActive: true })) };
		const { result, done } = await loadOptions('getClipDestinations', {
			params: { brandId: '={{ $json.brandId }}' },
			script: [
				{ method: 'GET', path: '/brands', body: both },
				{
					method: 'GET',
					path: '/clipper/publish-destinations',
					query: { brandId: BRAND },
					body: { destinations: [{ id: ACCOUNT, platform: 'youtube', accountName: 'old' }] },
				},
				{
					method: 'GET',
					path: '/clipper/publish-destinations',
					query: { brandId: BRAND_2 },
					body: { destinations: [{ id: ACCOUNT_2, platform: 'instagram', accountName: 'acme' }] },
				},
			],
		});
		done();
		assert.deepEqual(
			result.map((option) => option.name),
			['Old Brand: old (YouTube)', 'Acme Coffee: acme (Instagram)'],
		);
	});

	it('never sends a Brand expression to the API for videos and sources', async () => {
		const videos = await loadOptions('getVideos', {
			params: { brandId: '={{ $json.brandId }}' },
			script: [
				{
					method: 'GET',
					path: '/content/pieces',
					query: { status: 'ready', limit: 100 },
					body: {
						pieces: [
							{
								id: 'v1',
								format: 'kinetic-type',
								status: 'ready',
								script: { hook: 'We tested 40 ratios' },
								createdAt: '2026-10-12T14:39:16.893Z',
							},
						],
					},
				},
			],
		});
		assert.deepEqual(videos.result, [
			{ name: 'Text Story: We tested 40 ratios (2026-10-12)', value: 'v1' },
		]);

		const sources = await loadOptions('getContentSources', {
			params: { brandId: '={{ $json.brandId }}' },
		});
		assert.deepEqual(sources.result, []);
	});

	it('lists only ready content sources of the brand', async () => {
		const { result } = await loadOptions('getContentSources', {
			params: { brandId: BRAND },
			script: [
				{
					method: 'GET',
					path: '/content/sources',
					query: { brandId: BRAND, limit: 100 },
					body: {
						sources: [
							{ id: 's1', status: 'ready', title: 'Ratios guide', url: 'https://a.com/r' },
							{ id: 's2', status: 'pending', title: 'New page' },
							{ id: 's3', status: 'ready', url: 'https://a.com/x' },
						],
					},
				},
			],
		});
		assert.deepEqual(result, [
			{ name: 'Ratios guide', value: 's1' },
			{ name: 'https://a.com/x', value: 's3' },
		]);
	});

	it('offers only media videos a Hook & Demo can use, by storage key', async () => {
		const { result } = await loadOptions('getMediaVideos', {
			script: [
				{
					method: 'GET',
					path: '/content/media',
					query: { type: 'video', limit: 100 },
					body: {
						media: [
							{ id: 'm1', key: 'uploads/u/app-demo.mp4', name: 'App demo', usableForHookDemo: true },
							{ id: 'm2', key: 'uploads/u/long.mp4', name: 'Too long', usableForHookDemo: false },
							{ id: 'm3', key: 'uploads/u/hook-take-2.mp4', usableForHookDemo: true },
						],
					},
				},
			],
		});
		assert.deepEqual(result, [
			{ name: 'App demo', value: 'uploads/u/app-demo.mp4' },
			{ name: 'hook-take-2.mp4', value: 'uploads/u/hook-take-2.mp4' },
		]);
	});

	it('lists clips of recently finished jobs from one page of jobs', async () => {
		const job = {
			job_id: 'j1',
			status: 'completed',
			num_clips: 1,
			created_at: '2026-10-12T14:00:00.000Z',
			completed_at: '2026-10-12T14:30:00.000Z',
		};
		const { result, done } = await loadOptions('getClips', {
			script: [
				{
					method: 'GET',
					path: '/clipper/jobs',
					query: { limit: 100 },
					body: { jobs: [job], hasMore: true, nextCursor: 'more' },
				},
				{
					method: 'GET',
					path: '/clipper/jobs/j1',
					body: {
						...job,
						clips: [{ clip_id: 'c1', title: 'Why creators quit', duration: 42.6, file_url: 'https://x/c1.mp4' }],
					},
				},
			],
		});
		done();
		assert.deepEqual(result, [{ name: 'Why creators quit (43s)', value: 'c1' }]);
	});
});
