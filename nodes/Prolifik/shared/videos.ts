import type { IDataObject } from 'n8n-workflow';

import type { ApiContext } from './http';
import { apiGet } from './http';
import type { VideoItem } from './items';
import { videoItem } from './items';

// Rendered pieces, newest first. Pieces are ordered by when they were
// created, and a batch's pieces finish rendering a few minutes later, so a
// generous page keeps every newly rendered piece on the first page.
export const PAGE_SIZE = 50;
const SEEN_LIMIT = 1000;

export const listReadyVideos = async (
	api: ApiContext,
	{ brandId, format, limit = PAGE_SIZE }: { brandId?: string; format?: string; limit?: number },
): Promise<VideoItem[]> => {
	const data = await apiGet(api, '/content/pieces', { status: 'ready', limit, brandId, format });
	const pieces = Array.isArray(data.pieces) ? (data.pieces as IDataObject[]) : [];
	return pieces.filter((piece) => piece && piece.id && piece.status === 'ready').map(videoItem);
};

/** What the New Video trigger remembers between polls (workflow static data). */
export interface VideoPollState {
	/** The filters the seen list was taken with; a change re-seeds. */
	filterKey?: string;
	seenVideos?: string[];
}

/**
 * One live poll of New Video. The first poll, and the first after the Brand or
 * Format filter changes, only records the videos already rendered. Later polls
 * return the videos not seen before, oldest first.
 */
export const pollNewVideos = async (
	api: ApiContext,
	state: VideoPollState,
	filters: { brandId?: string; format?: string },
): Promise<{ videos: VideoItem[]; state: VideoPollState }> => {
	const filterKey = JSON.stringify([filters.brandId ?? '', filters.format ?? '']);
	const videos = await listReadyVideos(api, filters);
	const seeded = state.filterKey === filterKey && Array.isArray(state.seenVideos);
	const seen = new Set(seeded ? state.seenVideos : []);
	const fresh = seeded ? videos.filter((video) => !seen.has(video.id)).reverse() : [];
	videos
		.slice()
		.reverse()
		.forEach((video) => {
			seen.delete(video.id);
			seen.add(video.id);
		});
	return {
		videos: fresh,
		state: { filterKey, seenVideos: [...seen].slice(-SEEN_LIMIT) },
	};
};
