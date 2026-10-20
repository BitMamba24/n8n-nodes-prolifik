import type { INodeProperties } from 'n8n-workflow';

import { VIDEO_FORMATS } from './shared/constants';

const show = (resource: string, operation: string) => ({
	show: { resource: [resource], operation: [operation] },
});

// ---------------------------------------------------------------------------
// Resource and operation
// ---------------------------------------------------------------------------

const resource: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Brand', value: 'brand' },
		{ name: 'Clip', value: 'clip' },
		{ name: 'Content Source', value: 'contentSource' },
		{ name: 'Video', value: 'video' },
	],
	default: 'clip',
};

const operations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['brand'] } },
		options: [
			{
				name: 'Find',
				value: 'find',
				description: 'Find a brand by name',
				action: 'Find a brand',
			},
		],
		default: 'find',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['clip'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create vertical clips from a YouTube, Twitch or Kick video',
				action: 'Create clips',
			},
			{
				name: 'Publish',
				value: 'publish',
				description: 'Publish a clip to one of your social accounts. This creates a public post.',
				action: 'Publish a clip',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contentSource'] } },
		options: [
			{
				name: 'Add',
				value: 'add',
				description: 'Add a web page to a brand as a source for new videos',
				action: 'Add a content source',
			},
		],
		default: 'add',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['video'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a batch of branded videos for a brand',
				action: 'Create videos',
			},
			{
				name: 'Publish',
				value: 'publish',
				description: 'Publish a rendered video to your social accounts. This creates public posts.',
				action: 'Publish a video',
			},
		],
		default: 'create',
	},
];

// ---------------------------------------------------------------------------
// Brand > Find
// ---------------------------------------------------------------------------

const brandFind: INodeProperties[] = [
	{
		displayName: 'Brand Name',
		name: 'brandName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show('brand', 'find'),
		description:
			'The name as it appears in Prolifik. An exact match wins; otherwise the closest partial match is returned.',
	},
];

// ---------------------------------------------------------------------------
// Clip > Create
// ---------------------------------------------------------------------------

const clipCreate: INodeProperties[] = [
	{
		displayName: 'Video URL',
		name: 'videoUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://www.youtube.com/watch?v=...',
		displayOptions: show('clip', 'create'),
		description:
			'A link to one YouTube, Twitch or Kick video. Channels, playlists and live streams are not supported. Clipping uses clip minutes from your plan.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('clip', 'create'),
		options: [
			{
				displayName: 'Aspect Ratio',
				name: 'aspectRatio',
				type: 'options',
				options: [
					{ name: '1:1 Square', value: '1:1' },
					{ name: '16:9 Landscape', value: '16:9' },
					{ name: '4:5 Portrait', value: '4:5' },
					{ name: '9:16 Vertical (TikTok, Reels, Shorts)', value: '9:16' },
				],
				default: '9:16',
			},
			{
				displayName: 'Caption Style',
				name: 'captionStyle',
				type: 'options',
				options: [
					{ name: 'Bold: Big and Centered', value: 'bold' },
					{ name: 'Classic: White Caps, Yellow Highlight', value: 'classic' },
					{ name: 'Karaoke: Words Light Up as Spoken', value: 'karaoke' },
					{ name: 'Minimal: Small and Clean', value: 'minimal' },
					{ name: 'Neon: Cyan Glow', value: 'neon' },
					{ name: 'No Captions', value: 'none' },
				],
				default: 'classic',
			},
			{
				displayName: 'Clip Length',
				name: 'clipLength',
				type: 'options',
				options: [
					{ name: '3 to 5 Minutes', value: '180-300' },
					{ name: '30 to 60 Seconds', value: '30-60' },
					{ name: '60 to 90 Seconds', value: '60-90' },
					{ name: '90 Seconds to 3 Minutes', value: '90-180' },
					{ name: 'Under 30 Seconds', value: '10-30' },
				],
				default: '30-60',
				description: 'Leave this field out for clips of 30 to 90 seconds',
			},
			{
				displayName: 'Instructions',
				name: 'instructions',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description:
					'Tell the AI which moments to look for, for example "only the product demo parts". Up to 2,000 characters.',
			},
			{
				displayName: 'Layout',
				name: 'layout',
				type: 'options',
				options: [
					{ name: 'Blur Fill: Keeps the Whole Frame', value: 'blur' },
					{ name: 'Center Crop: Zooms Into the Middle', value: 'crop' },
					{ name: 'Smart Reframe: Follows the Speaker', value: 'smart' },
				],
				default: 'blur',
				description: 'How the video fits a vertical frame',
			},
			{
				displayName: 'Number of Clips',
				name: 'clipCount',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 20 },
				default: 3,
				description: 'How many clips to make, from 1 to 20',
			},
			{
				displayName: 'Spoken Language',
				name: 'language',
				type: 'options',
				options: [
					{ name: 'Arabic', value: 'ar' },
					{ name: 'Auto-Detect', value: 'auto' },
					{ name: 'Chinese', value: 'zh' },
					{ name: 'Dutch', value: 'nl' },
					{ name: 'English', value: 'en' },
					{ name: 'French', value: 'fr' },
					{ name: 'German', value: 'de' },
					{ name: 'Hindi', value: 'hi' },
					{ name: 'Indonesian', value: 'id' },
					{ name: 'Italian', value: 'it' },
					{ name: 'Japanese', value: 'ja' },
					{ name: 'Korean', value: 'ko' },
					{ name: 'Lithuanian', value: 'lt' },
					{ name: 'Polish', value: 'pl' },
					{ name: 'Portuguese', value: 'pt' },
					{ name: 'Russian', value: 'ru' },
					{ name: 'Spanish', value: 'es' },
					{ name: 'Turkish', value: 'tr' },
					{ name: 'Ukrainian', value: 'uk' },
				],
				default: 'auto',
				description: 'The language spoken in the video, used for captions',
			},
			{
				displayName: 'Video Type',
				name: 'videoType',
				type: 'options',
				options: [
					{ name: 'Casino Stream', value: 'casino' },
					{ name: 'General', value: 'generic' },
					{ name: 'Podcast or Interview', value: 'podcast' },
					{ name: 'Sports Broadcast (No Reaction Cam)', value: 'broadcast' },
					{ name: 'Stream Reaction', value: 'reaction' },
				],
				default: 'generic',
				description: 'Tells the AI what kind of moments to pick',
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Clip > Publish
// ---------------------------------------------------------------------------

const clipPublish: INodeProperties[] = [
	{
		displayName: 'This posts publicly to the social account you pick',
		name: 'clipPublishNotice',
		type: 'notice',
		default: '',
		displayOptions: show('clip', 'publish'),
	},
	{
		displayName: 'Brand Name or ID',
		name: 'brandId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getBrands' },
		default: '',
		displayOptions: show('clip', 'publish'),
		description:
			'Optional. Pick a brand to list its social accounts below; the post then only goes to one of that brand\'s accounts. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Clip Name or ID',
		name: 'clipId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getClips' },
		required: true,
		default: '',
		displayOptions: show('clip', 'publish'),
		description:
			'Map the clip ID from a New Clip trigger, or pick one of your recent clips. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Social Account Name or ID',
		name: 'destinationId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getClipDestinations', loadOptionsDependsOn: ['brandId'] },
		required: true,
		default: '',
		displayOptions: show('clip', 'publish'),
		description:
			'The account to post to. The clip\'s title and description become the caption. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('clip', 'publish'),
		options: [
			{
				displayName: 'Schedule For',
				name: 'scheduledFor',
				type: 'dateTime',
				default: '',
				description: 'When to post, within the next year. Leave this field out to post right away.',
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Content Source > Add
// ---------------------------------------------------------------------------

const contentSourceAdd: INodeProperties[] = [
	{
		displayName: 'Brand Name or ID',
		name: 'brandId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getBrands' },
		required: true,
		default: '',
		displayOptions: show('contentSource', 'add'),
		description:
			'The brand that will write videos from this page. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Page URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/blog/post',
		displayOptions: show('contentSource', 'add'),
		description:
			'A public web page, such as a blog post, product page or changelog. Prolifik reads it in about a minute; the source can be used in Create Videos once its status is ready.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('contentSource', 'add'),
		options: [
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: "A name to show in Prolifik. Defaults to the page's domain.",
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Video > Create
// ---------------------------------------------------------------------------

const videoCreate: INodeProperties[] = [
	{
		displayName: 'Brand Name or ID',
		name: 'brandId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getBrands' },
		required: true,
		default: '',
		displayOptions: show('video', 'create'),
		description:
			'The brand the videos are made for. Its voice, colors and logo are used. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		options: VIDEO_FORMATS,
		required: true,
		default: 'b-roll',
		displayOptions: show('video', 'create'),
		description:
			'The kind of video to make. Video Hook & Demo also needs a demo recording from your media library.',
	},
	{
		displayName: 'Number of Videos',
		name: 'count',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 50 },
		required: true,
		default: 1,
		displayOptions: show('video', 'create'),
		description:
			'From 1 to 50. Each video uses one render from your monthly render budget, and a job asking for more renders than you have left is refused.',
	},
	{
		displayName: 'Demo Video Name or ID',
		name: 'demoVideoKey',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMediaVideos' },
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['video'], operation: ['create'], format: ['talking-head'] },
		},
		description:
			'The product recording that plays after the hook: an mp4, mov or webm of up to 60 seconds and 100 MB from your Prolifik media library. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Hook Video Name or ID',
		name: 'hookVideoKey',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMediaVideos' },
		default: '',
		displayOptions: {
			show: { resource: ['video'], operation: ['create'], format: ['talking-head'] },
		},
		description:
			'Optional. Your own opening clip of up to 15 seconds; leave empty and each video gets a library hook clip. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Music Mood',
		name: 'audioMood',
		type: 'options',
		options: [
			{ name: 'Chill', value: 'chill' },
			{ name: 'Cinematic', value: 'cinematic' },
			{ name: 'Dramatic', value: 'dramatic' },
			{ name: 'Let Prolifik Pick', value: '' },
			{ name: 'Motivational', value: 'motivational' },
			{ name: 'No Music', value: 'none' },
			{ name: 'Upbeat', value: 'upbeat' },
		],
		default: '',
		displayOptions: {
			show: {
				resource: ['video'],
				operation: ['create'],
				format: ['kinetic-type', 'b-roll', 'talking-head'],
			},
		},
		description: 'The mood of the background music',
	},
	{
		displayName: 'Footage Subjects',
		name: 'personTags',
		type: 'multiOptions',
		options: [
			{ name: 'Animal', value: 'Animal' },
			{ name: 'Landscape/Building', value: 'Landscape/Building' },
			{ name: 'Man', value: 'Man' },
			{ name: 'Woman', value: 'Woman' },
		],
		default: [],
		displayOptions: {
			show: {
				resource: ['video'],
				operation: ['create'],
				format: ['carousel', 'kinetic-type', 'b-roll'],
			},
		},
		description: 'Only use library footage showing these subjects. Leave empty for any footage.',
	},
	{
		displayName: 'Your Own Text',
		name: 'customTexts',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Text',
		default: {},
		displayOptions: show('video', 'create'),
		description:
			'Optional wording to use exactly as written instead of AI-written text, one entry per video in video order. An empty entry lets the AI write that video. For Image Carousel, separate the slides in an entry with a | character.',
		options: [
			{
				displayName: 'Text',
				name: 'texts',
				values: [
					{
						displayName: 'Text',
						name: 'text',
						type: 'string',
						typeOptions: { rows: 2 },
						default: '',
						description: 'The text for this video',
					},
				],
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('video', 'create'),
		options: [
			{
				displayName: 'Add Brand Logo',
				name: 'includeLogo',
				type: 'boolean',
				default: false,
				description: "Whether to put the brand's logo on each video",
			},
			{
				displayName: 'Content Source Name or ID',
				name: 'contentSourceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getContentSources', loadOptionsDependsOn: ['brandId'] },
				default: '',
				description:
					'A web page added to the brand to write the videos from. A newly added page needs about a minute of analysis first. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Mention the Brand',
				name: 'mentionBrand',
				type: 'boolean',
				default: true,
				description: 'Whether the AI may name the brand in the text',
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Video > Publish
// ---------------------------------------------------------------------------

const videoPublish: INodeProperties[] = [
	{
		displayName: 'This posts publicly to every social account you pick',
		name: 'videoPublishNotice',
		type: 'notice',
		default: '',
		displayOptions: show('video', 'publish'),
	},
	{
		displayName: 'Brand Name or ID',
		name: 'brandId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getBrands' },
		required: true,
		default: '',
		displayOptions: show('video', 'publish'),
		description:
			'The brand the video and the social accounts belong to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Video Name or ID',
		name: 'videoId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVideos', loadOptionsDependsOn: ['brandId'] },
		required: true,
		default: '',
		displayOptions: show('video', 'publish'),
		description:
			'A rendered video of this brand. Map the video ID from a New Video trigger, or pick one. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Social Account Names or IDs',
		name: 'destinationIds',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getDestinations', loadOptionsDependsOn: ['brandId'] },
		required: true,
		default: [],
		displayOptions: show('video', 'publish'),
		description:
			'The brand\'s connected accounts to post to. Connect accounts in Prolifik under Settings > Social. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: show('video', 'publish'),
		description: 'The post text, up to 2,200 characters. Leave empty to post without a caption.',
	},
	{
		displayName: 'Hashtags',
		name: 'hashtags',
		type: 'string',
		default: '',
		placeholder: '#coldbrew #coffeetok',
		displayOptions: show('video', 'publish'),
		description:
			'Up to 30, separated by spaces or commas, added after the caption. The # is optional.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('video', 'publish'),
		options: [
			{
				displayName: 'AI-Generated Label',
				name: 'aiGenerated',
				type: 'boolean',
				default: true,
				description:
					"Whether to show the platform's AI-generated disclosure. Leave this field out and Prolifik turns it on when the video uses AI Studio media.",
			},
			{
				displayName: 'Schedule For',
				name: 'scheduledAt',
				type: 'dateTime',
				default: '',
				description:
					'When to post, between one minute and one year from now. Leave this field out to post right away.',
			},
		],
	},
];

export const actionProperties: INodeProperties[] = [
	resource,
	...operations,
	...brandFind,
	...clipCreate,
	...clipPublish,
	...contentSourceAdd,
	...videoCreate,
	...videoPublish,
];

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export const triggerProperties: INodeProperties[] = [
	{
		displayName: 'Event',
		name: 'event',
		type: 'options',
		noDataExpression: true,
		required: true,
		options: [
			{
				name: 'New Clip',
				value: 'newClip',
				description: 'Triggers when a new clip is ready',
			},
			{
				name: 'New Video',
				value: 'newVideo',
				description: 'Triggers when a new video finishes rendering',
			},
		],
		default: 'newClip',
	},
	{
		displayName: 'Source Video URL',
		name: 'sourceUrl',
		type: 'string',
		default: '',
		placeholder: 'https://www.youtube.com/watch?v=...',
		displayOptions: { show: { event: ['newClip'] } },
		description:
			'Only trigger on clips cut from this video, for example a YouTube, Twitch or Kick link. Leave empty to trigger on every clip.',
	},
	{
		displayName: 'Brand Name or ID',
		name: 'brandId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getBrands' },
		default: '',
		displayOptions: { show: { event: ['newVideo'] } },
		description:
			'Only trigger on this brand\'s videos. Leave empty for every brand. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		options: [{ name: 'Any Format', value: '' }, ...VIDEO_FORMATS],
		default: '',
		displayOptions: { show: { event: ['newVideo'] } },
		description: 'Only trigger on videos in this format',
	},
];
