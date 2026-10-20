import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { actionProperties } from './descriptions';
import { CREDENTIAL_NAME } from './shared/constants';
import type { ApiContext } from './shared/http';
import { apiContextOf } from './shared/http';
import type { IdempotencyScope } from './shared/idempotency';
import {
	brandOptions,
	clipOptions,
	contentSourceOptions,
	destinationOptions,
	mediaVideoOptions,
	videoOptions,
} from './shared/loadOptions';
import {
	addContentSource,
	createClipJob,
	createVideos,
	findBrands,
	publishClip,
	publishVideo,
} from './shared/operations';

// Programmatic rather than declarative: every write carries an
// Idempotency-Key hashed from the request body as sent, Create Videos keeps
// custom texts at their positions, Publish Clip checks the account against
// the Brand with a second request, and Find Brand ranks matches locally.

/** Reads one item's parameters and runs its operation. */
const runOperation = async (
	ctx: IExecuteFunctions,
	api: ApiContext,
	itemIndex: number,
	scope: IdempotencyScope,
): Promise<IDataObject[]> => {
	const param = (name: string, fallback: unknown = '') =>
		ctx.getNodeParameter(name, itemIndex, fallback as never) as unknown;
	const extra = param('additionalFields', {}) as IDataObject;
	const resource = param('resource') as string;
	const operation = param('operation') as string;
	const key = `${resource}:${operation}`;

	switch (key) {
		case 'brand:find': {
			const [best] = await findBrands(api, param('brandName'));
			return best ? [best] : [];
		}
		case 'clip:create':
			return [
				await createClipJob(
					api,
					{
						videoUrl: param('videoUrl'),
						clipCount: extra.clipCount,
						clipLength: extra.clipLength,
						videoType: extra.videoType,
						language: extra.language,
						captionStyle: extra.captionStyle,
						layout: extra.layout,
						aspectRatio: extra.aspectRatio,
						instructions: extra.instructions,
					},
					scope,
				),
			];
		case 'clip:publish':
			return [
				await publishClip(
					api,
					{
						brandId: param('brandId'),
						clipId: param('clipId'),
						destinationId: param('destinationId'),
						scheduledFor: extra.scheduledFor,
					},
					scope,
				),
			];
		case 'contentSource:add':
			return [
				await addContentSource(
					api,
					{ brandId: param('brandId'), url: param('url'), title: extra.title },
					scope,
				),
			];
		case 'video:create': {
			const customTexts = param('customTexts', {}) as { texts?: Array<{ text?: unknown }> };
			return [
				await createVideos(
					api,
					{
						brandId: param('brandId'),
						format: param('format'),
						count: param('count', 1),
						contentSourceId: extra.contentSourceId,
						includeLogo: extra.includeLogo,
						mentionBrand: extra.mentionBrand,
						customTexts: (customTexts.texts ?? []).map((entry) => entry?.text),
						demoVideoKey: param('demoVideoKey'),
						hookVideoKey: param('hookVideoKey'),
						audioMood: param('audioMood'),
						personTags: param('personTags', []),
					},
					scope,
				),
			];
		}
		case 'video:publish':
			return [
				await publishVideo(
					api,
					{
						brandId: param('brandId'),
						videoId: param('videoId'),
						destinationIds: param('destinationIds', []),
						caption: param('caption'),
						hashtags: param('hashtags'),
						scheduledAt: extra.scheduledAt,
						aiGenerated: extra.aiGenerated,
					},
					scope,
				),
			];
		default:
			throw new NodeOperationError(
				ctx.getNode(),
				`The operation "${operation}" is not supported for "${resource}"`,
			);
	}
};

export class Prolifik implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Prolifik',
		name: 'prolifik',
		icon: { light: 'file:prolifik.svg', dark: 'file:prolifik.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create AI clips and branded short-form videos and publish them with Prolifik',
		defaults: {
			name: 'Prolifik',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIAL_NAME,
				required: true,
			},
		],
		properties: actionProperties,
	};

	methods = {
		loadOptions: {
			async getBrands(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return brandOptions(apiContextOf(this));
			},
			async getDestinations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return destinationOptions(
					apiContextOf(this),
					this.getCurrentNodeParameter('brandId'),
					false,
				);
			},
			async getClipDestinations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return destinationOptions(
					apiContextOf(this),
					this.getCurrentNodeParameter('brandId'),
					true,
				);
			},
			async getVideos(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return videoOptions(apiContextOf(this), this.getCurrentNodeParameter('brandId'));
			},
			async getClips(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return clipOptions(apiContextOf(this));
			},
			async getContentSources(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return contentSourceOptions(apiContextOf(this), this.getCurrentNodeParameter('brandId'));
			},
			async getMediaVideos(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return mediaVideoOptions(apiContextOf(this));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const api = apiContextOf(this);
		const workflowId = this.getWorkflow().id;
		const executionId = this.getExecutionId();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const results = await runOperation(this, api, itemIndex, {
					workflowId,
					executionId,
					itemIndex,
				});
				results.forEach((json) => returnData.push({ json, pairedItem: { item: itemIndex } }));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				if (error instanceof NodeApiError) {
					error.context.itemIndex = itemIndex;
					// Returns the same error: the API errors are already NodeApiErrors.
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
				}
				if (error instanceof NodeOperationError) error.context.itemIndex = itemIndex;
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
