import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { triggerProperties } from './descriptions';
import type { ClipPollState } from './shared/clips';
import { listRecentClips, pollNewClips } from './shared/clips';
import { CREDENTIAL_NAME } from './shared/constants';
import { apiContextOf } from './shared/http';
import { brandOptions } from './shared/loadOptions';
import type { VideoPollState } from './shared/videos';
import { listReadyVideos, pollNewVideos } from './shared/videos';

export class ProlifikTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Prolifik Trigger',
		name: 'prolifikTrigger',
		icon: { light: 'file:prolifik.svg', dark: 'file:prolifik.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: '={{$parameter["event"] === "newClip" ? "New Clip" : "New Video"}}',
		description: 'Starts the workflow when a Prolifik clip is ready or a video finishes rendering',
		defaults: {
			name: 'Prolifik Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIAL_NAME,
				required: true,
			},
		],
		properties: triggerProperties,
	};

	methods = {
		loadOptions: {
			async getBrands(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return brandOptions(apiContextOf(this));
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const api = apiContextOf(this);
		const event = this.getNodeParameter('event') as string;
		const manual = this.getMode() === 'manual';
		const staticData = this.getWorkflowStaticData('node');

		if (event === 'newClip') {
			const sourceUrl = (this.getNodeParameter('sourceUrl', '') as string) || undefined;
			if (manual) {
				// A test fetch shows the clips of the most recently finished job.
				const clips = await listRecentClips(api, { sourceUrl, jobLimit: 1 });
				if (clips.length === 0) {
					throw new NodeOperationError(this.getNode(), 'No finished clips found yet', {
						description:
							'Create clips in Prolifik (or with the Prolifik node), wait for them to finish, then fetch again.',
					});
				}
				return [this.helpers.returnJsonArray(clips)];
			}
			const { clips, state } = await pollNewClips(
				api,
				(staticData.newClip as ClipPollState | undefined) ?? {},
				{ sourceUrl },
			);
			staticData.newClip = state as IDataObject;
			return clips.length > 0 ? [this.helpers.returnJsonArray(clips)] : null;
		}

		if (event === 'newVideo') {
			const filters = {
				brandId: (this.getNodeParameter('brandId', '') as string) || undefined,
				format: (this.getNodeParameter('format', '') as string) || undefined,
			};
			if (manual) {
				const [latest] = await listReadyVideos(api, { ...filters, limit: 1 });
				if (!latest) {
					throw new NodeOperationError(this.getNode(), 'No rendered videos found yet', {
						description:
							'Create videos in Prolifik (or with the Prolifik node), wait for them to render, then fetch again.',
					});
				}
				return [this.helpers.returnJsonArray([latest])];
			}
			const { videos, state } = await pollNewVideos(
				api,
				(staticData.newVideo as VideoPollState | undefined) ?? {},
				filters,
			);
			staticData.newVideo = state as IDataObject;
			return videos.length > 0 ? [this.helpers.returnJsonArray(videos)] : null;
		}

		throw new NodeOperationError(this.getNode(), `The event "${event}" is not supported`);
	}
}
