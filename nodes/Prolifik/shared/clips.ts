import type { IDataObject } from 'n8n-workflow';

import type { ApiContext } from './http';
import { apiGet, statusOfError } from './http';
import type { ClipItem } from './items';
import { clipItem } from './items';

// The API has no "list clips" endpoint: clips live under their job, and jobs
// are listed newest-created first. A long video finishes after jobs created
// later, so a poll pages back through recent jobs and opens the ones that
// finished since the last poll, whenever they were created.
const PAGE_SIZE = 100; // the API's maximum
const MAX_PAGES = 3;
// Paging stops at jobs created this long ago: none of them is still running.
const LOOKBACK_MS = 48 * 60 * 60 * 1000;
// Each detail read presigns every clip URL and counts against the 120
// requests a minute a key may make, shared with the user's other calls.
const MAX_JOBS_TO_OPEN = 25;
// A dropdown or a manual test run opens this many recently finished jobs.
const SAMPLE_JOBS = 10;
// Job IDs remembered between polls. Three pages hold at most 300 jobs.
const SEEN_LIMIT = 1000;

type Job = IDataObject & { job_id: string };

const timeOf = (value: unknown): number | null => {
	const ms = typeof value === 'string' ? Date.parse(value) : NaN;
	return Number.isNaN(ms) ? null : ms;
};

const finishedAt = (job: IDataObject): number =>
	timeOf(job.completed_at) || timeOf(job.created_at) || 0;

/** Clip jobs, newest created first, back to LOOKBACK_MS or `maxPages` pages, without duplicates. */
export const listJobs = async (
	api: ApiContext,
	maxPages = MAX_PAGES,
	now = Date.now(),
): Promise<Job[]> => {
	const horizon = now - LOOKBACK_MS;
	const jobs: Job[] = [];
	const seen = new Set<string>();
	let before: string | undefined;
	for (let page = 0; page < maxPages; page += 1) {
		const data = await apiGet(api, '/clipper/jobs', { limit: PAGE_SIZE, before });
		const batch = (Array.isArray(data.jobs) ? (data.jobs as IDataObject[]) : []).filter(
			(job): job is Job => !!job && typeof job.job_id === 'string' && job.job_id !== '',
		);
		batch.forEach((job) => {
			// Keyset pages never overlap; an older API's timestamp cursor could.
			if (seen.has(job.job_id)) return;
			seen.add(job.job_id);
			jobs.push(job);
		});
		const oldest = batch.length > 0 ? timeOf(batch[batch.length - 1].created_at) : null;
		if (!data.nextCursor || data.hasMore === false || batch.length === 0) break;
		if (oldest !== null && oldest < horizon) break;
		before = String(data.nextCursor);
	}
	return jobs;
};

const isReadyClip = (clip: IDataObject) =>
	!!clip &&
	typeof clip.clip_id === 'string' &&
	clip.clip_id !== '' &&
	typeof clip.file_url === 'string' &&
	clip.file_url !== '' &&
	clip.status !== 'failed';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
// kick.com/<channel>/videos/<uuid>, and the bare kick.com/video/<uuid> a
// user may paste (the API refuses it for clipping, but it names the same VOD).
const KICK_VOD_PATH = /^\/(?:[\w-]+\/videos|video)\/([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})/i;

/**
 * A comparable identity for a source video link, so the Source Video URL
 * filter matches however the link was pasted and however the API stored it:
 * the platform plus the video's own ID for YouTube (watch, youtu.be, Shorts,
 * live, embed), Twitch VODs and clips, and Kick VODs and clips. Any other link
 * compares without scheme, "www.", query, fragment, trailing slash or case.
 */
export const videoKey = (value: unknown): string => {
	const text = String(value || '').trim();
	if (!text) return '';
	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
	} catch {
		return text.toLowerCase();
	}
	const host = url.hostname.toLowerCase().replace(/^(?:www|m|mobile|go|music)\./, '');
	const path = url.pathname;
	const param = (name: string) => (url.searchParams.get(name) || '').trim();

	if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
		const id =
			host === 'youtu.be'
				? path.split('/')[1]
				: /^\/watch\/?$/i.test(path)
					? param('v')
					: (path.match(/^\/(?:shorts|live|embed|v)\/([^/]+)/i) || [])[1];
		if (id && YOUTUBE_ID.test(id)) return `youtube:${id}`;
	}

	if (host === 'twitch.tv' || host === 'player.twitch.tv' || host === 'clips.twitch.tv') {
		const vod =
			host === 'player.twitch.tv'
				? param('video').replace(/^v/i, '')
				: (path.match(/^\/(?:videos|[^/]+\/v(?:ideo)?)\/(\d+)/i) || [])[1];
		if (vod && /^\d+$/.test(vod)) return `twitch:vod:${vod}`;
		const clip =
			host === 'clips.twitch.tv'
				? param('clip') || path.split('/').filter(Boolean).pop()
				: (path.match(/^\/(?:[^/]+\/)?clip\/([^/]+)/i) || [])[1];
		if (clip && clip.toLowerCase() !== 'embed') return `twitch:clip:${clip}`;
	}

	if (host === 'kick.com') {
		const vod = path.match(KICK_VOD_PATH);
		if (vod) return `kick:vod:${vod[1].toLowerCase()}`;
		const clip = param('clip') || (path.match(/^\/[\w-]+\/clips\/(clip_[\w-]+)/i) || [])[1];
		if (clip) return `kick:clip:${clip}`;
	}

	return `${host}${path.replace(/\/+$/, '')}`.toLowerCase();
};

const hasClips = (job: IDataObject) =>
	job.status === 'completed' && typeof job.num_clips === 'number' && job.num_clips > 0;

/** Ready clips of each job, opened in parallel; a job deleted since the list read is skipped. */
const openJobs = async (
	api: ApiContext,
	jobs: Job[],
): Promise<Array<{ job: Job; clips: ClipItem[] | null }>> =>
	Promise.all(
		jobs.map(async (job) => {
			const detail = await apiGet(api, `/clipper/jobs/${encodeURIComponent(job.job_id)}`).catch(
				(error: unknown) => {
					if (statusOfError(error) === 404) return null;
					throw error;
				},
			);
			if (!detail) return { job, clips: null };
			const clips = Array.isArray(detail.clips) ? (detail.clips as IDataObject[]) : [];
			return { job, clips: clips.filter(isReadyClip).map((clip) => clipItem(detail, clip)) };
		}),
	);

const uniqueById = (clips: ClipItem[]): ClipItem[] => {
	const seen = new Set<string>();
	return clips.filter((clip) => {
		if (seen.has(clip.id)) return false;
		seen.add(clip.id);
		return true;
	});
};

/**
 * Clips of the most recently finished jobs, newest finished first, for the
 * Clip dropdown and a manual test run. `sourceUrl` keeps only clips cut from
 * that video; `maxPages` caps the job list reads and `jobLimit` the jobs opened.
 */
export const listRecentClips = async (
	api: ApiContext,
	{
		sourceUrl,
		maxPages = MAX_PAGES,
		jobLimit = SAMPLE_JOBS,
	}: { sourceUrl?: string; maxPages?: number; jobLimit?: number } = {},
): Promise<ClipItem[]> => {
	const wanted = videoKey(sourceUrl);
	const jobs = (await listJobs(api, maxPages))
		.filter(hasClips)
		.filter((job) => !wanted || videoKey(job.source_url) === wanted)
		.sort((a, b) => finishedAt(b) - finishedAt(a))
		.slice(0, jobLimit);
	const opened = await openJobs(api, jobs);
	return uniqueById(opened.flatMap((entry) => entry.clips ?? []));
};

/** What the New Clip trigger remembers between polls (workflow static data). */
export interface ClipPollState {
	seeded?: boolean;
	seenJobs?: string[];
}

/**
 * One live poll of New Clip. Returns the new clips, oldest finished first, and
 * the state to store; the caller stores it only when the poll succeeded, so a
 * failed detail read is retried by the next poll.
 *
 * The first poll after activation only records the jobs that already exist.
 * Every later poll opens finished jobs it has not seen yet (at most 25, the
 * oldest first; the rest wait for the next poll), so a poll with nothing new
 * is one request and a job that finished hours after newer jobs were created
 * still triggers, as long as it was created within the last 48 hours and 300
 * jobs.
 */
export const pollNewClips = async (
	api: ApiContext,
	state: ClipPollState,
	{ sourceUrl }: { sourceUrl?: string } = {},
): Promise<{ clips: ClipItem[]; state: ClipPollState }> => {
	const jobs = await listJobs(api);
	const finished = jobs.filter((job) => job.status === 'completed');
	const seen = new Set(state.seenJobs ?? []);
	const remember = (ids: string[]) => {
		ids.forEach((id) => {
			seen.delete(id);
			seen.add(id);
		});
		return [...seen].slice(-SEEN_LIMIT);
	};

	if (!state.seeded) {
		return {
			clips: [],
			state: { seeded: true, seenJobs: remember(finished.map((j) => j.job_id)) },
		};
	}

	const wanted = videoKey(sourceUrl);
	const unseen = finished.filter((job) => !seen.has(job.job_id));
	// Finished jobs with no clips, or from another video, are settled without a read.
	const skipped = unseen.filter(
		(job) => !hasClips(job) || (wanted !== '' && videoKey(job.source_url) !== wanted),
	);
	const toOpen = unseen
		.filter((job) => !skipped.includes(job))
		.sort((a, b) => finishedAt(a) - finishedAt(b))
		.slice(0, MAX_JOBS_TO_OPEN);

	const opened = await openJobs(api, toOpen);
	const clips = uniqueById(opened.flatMap((entry) => entry.clips ?? []));
	return {
		clips,
		state: {
			seeded: true,
			seenJobs: remember([...skipped, ...toOpen].map((job) => job.job_id)),
		},
	};
};
