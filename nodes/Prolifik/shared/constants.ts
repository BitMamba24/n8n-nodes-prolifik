export const API_BASE = 'https://app.getprolifik.com/api/v1';

export const CREDENTIAL_NAME = 'prolifikApi';

// Opens the dashboard on Settings > Developer API (top-nav deep link).
export const KEY_SETTINGS_URL = 'https://app.getprolifik.com/home?settings=developer';
export const PRICING_URL = 'https://app.getprolifik.com/pricing';
export const API_DOCS_URL = 'https://getprolifik.com/docs/api';

// Every scope the node can touch. publish:write is off by default in the key
// form, so the credential help text names it.
export const REQUIRED_SCOPES = [
	'clipper:read',
	'clipper:write',
	'content:read',
	'content:write',
	'publish:write',
];

export const PLAN_NAMES: Record<string, string> = {
	lite: 'Lite',
	starter: 'Starter',
	pro: 'Pro',
	enterprise: 'Enterprise',
};

// Mirrors src/lib/content/formats.ts in the app and the Zapier integration's
// Format menu. Sorted by label for the n8n option list.
export const VIDEO_FORMATS = [
	{ value: 'b-roll', name: 'B-Roll Montage' },
	{ value: 'caption-card', name: 'Caption Meme' },
	{ value: 'carousel', name: 'Image Carousel' },
	{ value: 'scene-swap', name: 'Meme Reaction' },
	{ value: 'kinetic-type', name: 'Text Story' },
	{ value: 'talking-head', name: 'Video Hook & Demo' },
];

export const FORMAT_LABELS: Record<string, string> = VIDEO_FORMATS.reduce(
	(labels, format) => ({ ...labels, [format.value]: format.name }),
	{} as Record<string, string>,
);

/**
 * Which optional filters each format accepts (src/lib/public-api/content.ts
 * parseAssetFilters). The API rejects a filter a format does not take, so the
 * fields only show, and are only sent, for the formats that use them.
 */
export const FORMAT_FILTERS: Record<string, { personTags?: boolean; audioMood?: boolean }> = {
	carousel: { personTags: true },
	'kinetic-type': { personTags: true, audioMood: true },
	'b-roll': { personTags: true, audioMood: true },
	'scene-swap': {},
	'caption-card': {},
	'talking-head': { audioMood: true },
};

export const PLATFORM_LABELS: Record<string, string> = {
	instagram: 'Instagram',
	tiktok: 'TikTok',
	youtube: 'YouTube',
	x: 'X',
	twitter: 'X',
	linkedin: 'LinkedIn',
	facebook: 'Facebook',
	threads: 'Threads',
	pinterest: 'Pinterest',
	bluesky: 'Bluesky',
};

// Length presets from the in-app clip form (clip-settings-fields.tsx).
export const CLIP_LENGTHS: Record<string, [number, number]> = {
	'10-30': [10, 30],
	'30-60': [30, 60],
	'60-90': [60, 90],
	'90-180': [90, 180],
	'180-300': [180, 300],
};
