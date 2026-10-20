import type { IDataObject } from 'n8n-workflow';

import { FORMAT_LABELS, PLATFORM_LABELS } from './constants';

// Flat, snake_case shapes for everything the nodes return, the same as the
// Zapier integration's, so a workflow ported from a Zap keeps its field names.
// Each builder emits the same keys every time (null when the API has no value).

type Raw = IDataObject;

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;
const bool = (value: unknown): boolean => value === true;
const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
		: [];
const obj = (value: unknown): Raw =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

export const platformLabel = (platform: unknown): string => {
	if (typeof platform !== 'string' || !platform) return 'Social account';
	return (
		PLATFORM_LABELS[platform.toLowerCase()] || platform.charAt(0).toUpperCase() + platform.slice(1)
	);
};

export const truncate = (text: unknown, max: number): string => {
	const clean = String(text || '')
		.replace(/\s+/g, ' ')
		.trim();
	return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
};

const hashtagText = (tags: unknown): string =>
	strings(tags)
		.map((tag) => tag.trim())
		.filter(Boolean)
		.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
		.join(' ');

export const brandItem = (brand: Raw) => ({
	id: String(brand.id),
	name: str(brand.name) || '',
	website_url: str(brand.websiteUrl),
	description: str(brand.description),
	target_audience: str(brand.targetAudience),
	voice: str(brand.voice),
	logo_url: str(brand.logoUrl),
	primary_colors: strings(brand.primaryColors),
	enrichment_status: str(brand.enrichmentStatus),
	is_active: bool(brand.isActive),
	created_at: str(brand.createdAt),
});
export type BrandItem = ReturnType<typeof brandItem>;

export const destinationItem = (destination: Raw) => {
	const accountName = str(destination.accountName) || '';
	const platform = str(destination.platform) || '';
	return {
		id: String(destination.id),
		platform,
		account_name: accountName,
		label: accountName ? `${accountName} (${platformLabel(platform)})` : platformLabel(platform),
	};
};

/** A content piece, which the node calls a video. */
export const videoItem = (piece: Raw) => {
	const script = obj(piece.script);
	const format = str(piece.format) || '';
	return {
		id: String(piece.id),
		job_id: str(piece.jobId),
		format,
		format_label: FORMAT_LABELS[format] || format,
		status: str(piece.status),
		review_status: str(piece.reviewStatus),
		video_url: str(piece.videoUrl),
		thumbnail_url: str(piece.thumbnailUrl),
		slide_urls: strings(piece.slideUrls),
		hook: str(script.hook) || '',
		body: str(script.body) || '',
		cta: str(script.cta) || '',
		slide_texts: strings(script.slides),
		include_logo: bool(piece.includeLogo),
		created_at: str(piece.createdAt),
		expires_at: str(piece.expiresAt),
	};
};
export type VideoItem = ReturnType<typeof videoItem>;

export const videoLabel = (video: VideoItem): string => {
	const text = video.hook || video.slide_texts[0] || video.body || 'Untitled';
	const day = video.created_at ? video.created_at.slice(0, 10) : '';
	return `${video.format_label}: ${truncate(text, 70)}${day ? ` (${day})` : ''}`;
};

/** A clip from GET /clipper/jobs/{id}, flattened with its job's source. */
export const clipItem = (job: Raw, clip: Raw) => {
	const source = obj(job.source);
	return {
		id: String(clip.clip_id),
		title: str(clip.title) || '',
		description: str(clip.description) || '',
		hook: str(clip.hook) || '',
		hashtags: hashtagText(clip.hashtags),
		duration: num(clip.duration) || 0,
		start_time: num(clip.start_time) || 0,
		end_time: num(clip.end_time) || 0,
		virality_score: num(clip.virality_score) || 0,
		video_url: str(clip.file_url) || '',
		thumbnail_url: str(clip.thumbnail_url),
		job_id: String(job.job_id),
		source_url: str(source.url) || '',
		source_title: str(source.title) || '',
		source_channel: str(source.channel) || '',
		aspect_ratio: str(job.aspect_ratio),
		created_at: str(job.completed_at) || str(job.created_at),
	};
};
export type ClipItem = ReturnType<typeof clipItem>;

export const clipLabel = (clip: ClipItem): string =>
	`${truncate(clip.title || clip.hook || 'Untitled clip', 70)} (${Math.round(clip.duration)}s)`;

/** A content job from POST /content/jobs. */
export const videoJobItem = (job: Raw, notice: unknown) => ({
	id: String(job.id),
	brand_id: str(job.brandId),
	content_source_id: str(job.contentSourceId),
	format: str(job.format),
	format_label: FORMAT_LABELS[String(job.format)] || str(job.format),
	status: str(job.status),
	requested_videos: num(job.requestedPieces),
	expected_videos: num(job.expectedPieces),
	include_logo: bool(job.includeLogo),
	mention_brand: bool(job.mentionBrand),
	created_at: str(job.createdAt),
	notice: str(notice),
});

export const sourceItem = (source: Raw) => ({
	id: String(source.id),
	brand_id: str(source.brandId),
	url: str(source.url),
	title: str(source.title),
	status: str(source.status),
	error: str(source.error),
	created_at: str(source.createdAt),
	updated_at: str(source.updatedAt),
});

export const contentPublishItem = (publish: Raw) => ({
	id: String(publish.id),
	video_id: str(publish.contentPieceId),
	status: str(publish.status),
	platforms: strings(publish.platforms),
	destination_ids: strings(publish.connectionIds),
	caption: str(publish.caption) || '',
	hashtags: hashtagText(publish.hashtags),
	scheduled_at: str(publish.scheduledAt),
	posted_at: str(publish.postedAt),
	ai_generated: bool(publish.aiGenerated),
	created_at: str(publish.createdAt),
});

export const clipPublishItem = (record: Raw) => ({
	id: String(record.id),
	clip_id: str(record.clip_id),
	job_id: str(record.job_id),
	destination_id: str(record.account_id),
	platform: str(record.platform),
	account_handle: str(record.account_handle),
	title: str(record.title),
	caption: str(record.description) || '',
	status: str(record.status),
	scheduled_for: str(record.scheduled_for),
	created_at: str(record.published_at),
	completed_at: str(record.completed_at),
});
