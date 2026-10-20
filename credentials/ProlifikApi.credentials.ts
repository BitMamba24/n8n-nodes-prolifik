import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ProlifikApi implements ICredentialType {
	name = 'prolifikApi';

	displayName = 'Prolifik API';

	icon: Icon = {
		light: 'file:../nodes/Prolifik/prolifik.svg',
		dark: 'file:../nodes/Prolifik/prolifik.dark.svg',
	};

	documentationUrl = 'https://getprolifik.com/docs/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'plk_live_...',
			description:
				'Create a key in Prolifik under <a href="https://app.getprolifik.com/home?settings=developer">Settings &gt; Developer API</a>. Tick the scopes clipper:read, clipper:write, content:read, content:write and publish:write. Keys need a paid plan and expire after the 30, 90 or 365 days you pick.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{ "Bearer " + String($credentials.apiKey).trim() }}',
			},
		},
	};

	// GET /usage is the cheapest call that proves the key: it needs a valid,
	// unexpired key with content:read and touches no media.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.getprolifik.com/api/v1',
			url: '/usage',
			method: 'GET',
		},
	};
}
