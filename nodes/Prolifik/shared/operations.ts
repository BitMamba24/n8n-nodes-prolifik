import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { CLIP_LENGTHS, FORMAT_FILTERS } from './constants';
import type { ApiContext } from './http';
import { apiGet, apiPost } from './http';
import type { IdempotencyScope } from './idempotency';
import { customTextsFor, toBool, toHashtags, toInt, toList, trimmed } from './inputs';
import type { BrandItem } from './items';
import { brandItem, clipPublishItem, contentPublishItem, sourceItem, videoJobItem } from './items';

// One function per operation. Each takes plain values read from the node's
// parameters, builds the API request and returns the output item(s), so the
// request building is tested without n8n.

export interface CreateClipsInput {
	videoUrl: unknown;
	clipCount?: unknown;
	clipLength?: unknown;
	videoType?: unknown;
	language?: unknown;
	captionStyle?: unknown;
	layout?: unknown;
	aspectRatio?: unknown;
	instructions?: unknown;
}

export const createClipJob = async (
	api: ApiContext,
	input: CreateClipsInput,
	scope: IdempotencyScope,
) => {
	const videoUrl = trimmed(input.videoUrl);
	if (!videoUrl) throw new NodeOperationError(api.node, 'Video URL is required');
	const clipCount = toInt(api.node, input.clipCount, 'Number of Clips');
	const length = CLIP_LENGTHS[trimmed(input.clipLength) ?? ''] ?? [];

	const job = await apiPost(
		api,
		'/clipper/jobs',
		{
			url: videoUrl,
			numClips: clipCount,
			minDuration: length[0],
			maxDuration: length[1],
			captionStyle: trimmed(input.captionStyle),
			layout: trimmed(input.layout),
			aspectRatio: trimmed(input.aspectRatio),
			userPrompt: trimmed(input.instructions),
			options: {
				language: trimmed(input.language),
				format: trimmed(input.videoType),
			},
		},
		{ dedupe: 'job', scope },
	);

	return {
		id: String(job.job_id),
		status: typeof job.status === 'string' ? job.status : 'queued',
		created_at: typeof job.created_at === 'string' ? job.created_at : null,
		video_url: videoUrl,
	};
};

export interface CreateVideosInput {
	brandId: unknown;
	format: unknown;
	count?: unknown;
	contentSourceId?: unknown;
	includeLogo?: unknown;
	mentionBrand?: unknown;
	/** One entry per video, in video order; blank entries keep their position. */
	customTexts?: unknown[];
	demoVideoKey?: unknown;
	hookVideoKey?: unknown;
	audioMood?: unknown;
	personTags?: unknown;
}

export const createVideos = async (
	api: ApiContext,
	input: CreateVideosInput,
	scope: IdempotencyScope,
) => {
	const format = trimmed(input.format);
	const count = toInt(api.node, input.count, 'Number of Videos');
	const requested = count === undefined ? 1 : count;
	const filters = FORMAT_FILTERS[format ?? ''] ?? {};
	const isHookDemo = format === 'talking-head';

	const data = await apiPost(
		api,
		'/content/jobs',
		{
			brandId: trimmed(input.brandId),
			format,
			count: requested,
			contentSourceId: trimmed(input.contentSourceId),
			includeLogo: toBool(input.includeLogo),
			mentionBrand: toBool(input.mentionBrand),
			customTexts: customTextsFor(api.node, input.customTexts ?? [], format, requested),
			demoVideoKey: isHookDemo ? trimmed(input.demoVideoKey) : undefined,
			hookVideoKey: isHookDemo ? trimmed(input.hookVideoKey) : undefined,
			assetFilters: {
				audioMood: filters.audioMood ? trimmed(input.audioMood) : undefined,
				personTags: filters.personTags ? toList(input.personTags) : undefined,
			},
		},
		{ dedupe: 'job', scope },
	);

	return videoJobItem((data.job as IDataObject) || {}, data.notice);
};

export const addContentSource = async (
	api: ApiContext,
	input: { brandId: unknown; url: unknown; title?: unknown },
	scope: IdempotencyScope,
) => {
	const data = await apiPost(
		api,
		'/content/sources',
		{
			brandId: trimmed(input.brandId),
			url: trimmed(input.url),
			title: trimmed(input.title),
		},
		{ dedupe: 'job', scope },
	);
	return sourceItem((data.source as IDataObject) || {});
};

export interface PublishVideoInput {
	brandId: unknown;
	videoId: unknown;
	destinationIds: unknown;
	caption?: unknown;
	hashtags?: unknown;
	scheduledAt?: unknown;
	aiGenerated?: unknown;
}

export const publishVideo = async (
	api: ApiContext,
	input: PublishVideoInput,
	scope: IdempotencyScope,
) => {
	const videoId = trimmed(input.videoId);
	if (!videoId) throw new NodeOperationError(api.node, 'Video is required');
	const destinationIds = toList(input.destinationIds);
	if (destinationIds.length === 0) {
		throw new NodeOperationError(api.node, 'Pick at least one social account');
	}

	const data = await apiPost(
		api,
		`/content/pieces/${encodeURIComponent(videoId)}/publish`,
		{
			brandId: trimmed(input.brandId),
			connectionIds: destinationIds,
			// The API requires a caption key; an empty one posts without a caption.
			// A whitespace-only caption counts as empty.
			caption: typeof input.caption === 'string' && input.caption.trim() ? input.caption : '',
			hashtags: toHashtags(input.hashtags),
			scheduledAt: trimmed(input.scheduledAt),
			aiGenerated: toBool(input.aiGenerated),
		},
		{ dedupe: 'post', scope, keepEmpty: ['caption'] },
	);

	return contentPublishItem((data.publish as IDataObject) || {});
};

/**
 * The Clipper API posts to any account on any of the user's active brands,
 * so a picked Brand is enforced here: the account must be one of its own.
 * This also catches a Brand set by an expression, which the dropdown cannot
 * filter by.
 */
const assertBrandAccount = async (api: ApiContext, brandId: string, destinationId: string) => {
	const data = await apiGet(api, '/clipper/publish-destinations', { brandId });
	const accounts = Array.isArray(data.destinations) ? (data.destinations as IDataObject[]) : [];
	if (!accounts.some((account) => account && account.id === destinationId)) {
		throw new NodeOperationError(
			api.node,
			'That social account is not connected to the brand you picked, or the brand is locked by your plan',
			{ description: "Pick one of the brand's accounts, or leave Brand empty." },
		);
	}
};

export const publishClip = async (
	api: ApiContext,
	input: { brandId?: unknown; clipId: unknown; destinationId: unknown; scheduledFor?: unknown },
	scope: IdempotencyScope,
) => {
	const clipId = trimmed(input.clipId);
	const destinationId = trimmed(input.destinationId);
	if (!clipId) throw new NodeOperationError(api.node, 'Clip is required');
	if (!destinationId) throw new NodeOperationError(api.node, 'Social account is required');
	const brandId = trimmed(input.brandId);
	if (brandId) await assertBrandAccount(api, brandId, destinationId);

	const record = await apiPost(
		api,
		`/clipper/clips/${encodeURIComponent(clipId)}/publish`,
		{
			connectionId: destinationId,
			scheduledFor: trimmed(input.scheduledFor),
		},
		{ dedupe: 'post', scope },
	);
	return clipPublishItem(record);
};

const normalize = (text: unknown) =>
	String(text || '')
		.trim()
		.toLowerCase();

/**
 * Brands whose name matches, best first. GET /brands has no name filter, so
 * matching happens here: exact name first, then names that start with the
 * text, then names that contain it. Within each, brands usable on the current
 * plan come before locked ones, which every operation refuses.
 */
export const findBrands = async (api: ApiContext, name: unknown): Promise<BrandItem[]> => {
	const query = normalize(name);
	if (!query) return [];
	const data = await apiGet(api, '/brands');
	const brands = (Array.isArray(data.brands) ? (data.brands as IDataObject[]) : []).map(brandItem);
	const rank = (brand: BrandItem) => {
		const brandName = normalize(brand.name);
		if (brandName === query) return 0;
		if (brandName.startsWith(query)) return 1;
		if (brandName.includes(query)) return 2;
		return -1;
	};
	return brands
		.map((brand) => ({ brand, score: rank(brand) }))
		.filter((entry) => entry.score >= 0)
		.sort((a, b) => a.score - b.score || Number(b.brand.is_active) - Number(a.brand.is_active))
		.map((entry) => entry.brand);
};
