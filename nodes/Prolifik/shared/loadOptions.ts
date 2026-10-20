import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

import { listRecentClips } from './clips';
import { listDestinations } from './destinations';
import type { ApiContext } from './http';
import { apiGet } from './http';
import { isUuid } from './inputs';
import { brandItem, clipLabel, sourceItem, videoLabel } from './items';
import { listReadyVideos } from './videos';

// The dropdown lists. Each takes the current Brand parameter where the list
// depends on it; a Brand set by an expression is never sent to the API.

/** Every brand, newest first; plan-locked brands are marked. */
export const brandOptions = async (api: ApiContext): Promise<INodePropertyOptions[]> => {
	const data = await apiGet(api, '/brands');
	const brands = Array.isArray(data.brands) ? (data.brands as IDataObject[]) : [];
	return brands
		.map(brandItem)
		.map((brand) => ({
			name: brand.is_active ? brand.name : `${brand.name} (locked by your plan)`,
			value: brand.id,
		}))
		.reverse();
};

/** Social accounts for Publish Video (`clipper` false) or Publish Clip (`clipper` true). */
export const destinationOptions = async (
	api: ApiContext,
	brandId: unknown,
	clipper: boolean,
): Promise<INodePropertyOptions[]> => {
	const path = clipper ? '/clipper/publish-destinations' : '/publish-destinations';
	const accounts = await listDestinations(api, path, brandId);
	return accounts.map((account) => ({ name: account.label, value: account.id }));
};

/** The 100 newest rendered videos, of the Brand when it holds a brand. */
export const videoOptions = async (
	api: ApiContext,
	brandId: unknown,
): Promise<INodePropertyOptions[]> => {
	const videos = await listReadyVideos(api, {
		brandId: isUuid(brandId) ? brandId.trim() : undefined,
		limit: 100,
	});
	return videos.map((video) => ({ name: videoLabel(video), value: video.id }));
};

/** Clips of the most recently finished clip jobs; one page of jobs keeps it quick. */
export const clipOptions = async (api: ApiContext): Promise<INodePropertyOptions[]> => {
	const clips = await listRecentClips(api, { maxPages: 1 });
	return clips.map((clip) => ({ name: clipLabel(clip), value: clip.id }));
};

/**
 * Analyzed web pages of the Brand. Only ready sources are listed: the API
 * refuses a job on a source still being analyzed. Without a picked brand
 * there is nothing to list; set the source by expression instead.
 */
export const contentSourceOptions = async (
	api: ApiContext,
	brandId: unknown,
): Promise<INodePropertyOptions[]> => {
	if (!isUuid(brandId)) return [];
	const data = await apiGet(api, '/content/sources', { brandId: brandId.trim(), limit: 100 });
	const sources = Array.isArray(data.sources) ? (data.sources as IDataObject[]) : [];
	return sources
		.filter((source) => source && source.id && source.status === 'ready')
		.map(sourceItem)
		.map((source) => ({ name: source.title || source.url || source.id, value: source.id }));
};

/**
 * Media library videos a Video Hook & Demo job may use. The value is the
 * storage key the API expects, not the row ID.
 */
export const mediaVideoOptions = async (api: ApiContext): Promise<INodePropertyOptions[]> => {
	const data = await apiGet(api, '/content/media', { type: 'video', limit: 100 });
	const media = Array.isArray(data.media) ? (data.media as IDataObject[]) : [];
	return media
		.filter(
			(item) => item && item.id && item.usableForHookDemo === true && typeof item.key === 'string',
		)
		.map((item) => {
			const key = String(item.key);
			const name =
				typeof item.name === 'string' && item.name.trim()
					? item.name.trim()
					: (key.split('/').pop() ?? key);
			return { name, value: key };
		});
};
