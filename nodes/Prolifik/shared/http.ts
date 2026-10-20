import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import {
	API_BASE,
	CREDENTIAL_NAME,
	KEY_SETTINGS_URL,
	PRICING_URL,
	REQUIRED_SCOPES,
} from './constants';
import type { DedupeKind, IdempotencyScope } from './idempotency';
import { idempotencyKey } from './idempotency';

export interface FullResponse {
	statusCode: number;
	headers: Record<string, unknown>;
	body: unknown;
}

/**
 * What every API call needs: the node (for errors) and a function that sends
 * an authenticated request and returns the full response without throwing on
 * HTTP errors. Tests pass a fake `request`.
 */
export interface ApiContext {
	node: INode;
	request: (options: IHttpRequestOptions) => Promise<FullResponse>;
}

type AuthedFunctions = IExecuteFunctions | IPollFunctions | ILoadOptionsFunctions;

/** The ApiContext of a node execution, poll or dropdown load. */
export const apiContextOf = (ctx: AuthedFunctions): ApiContext => ({
	node: ctx.getNode(),
	request: async (options) =>
		(await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL_NAME, {
			...options,
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		})) as FullResponse,
});

/** True for values n8n hands over for an empty or unset field. */
export const isBlank = (value: unknown): boolean =>
	value === undefined ||
	value === null ||
	(typeof value === 'string' && value.trim() === '') ||
	(Array.isArray(value) && value.length === 0);

/**
 * Drop blank values recursively so optional fields never reach the API as
 * empty strings. Arrays keep every entry and position: the API reads
 * customTexts by index, where null means "the AI writes this video", so list
 * builders drop blank entries themselves.
 */
export const compact = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(compact);
	if (value && typeof value === 'object') {
		const source = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		Object.keys(source).forEach((key) => {
			const entry = compact(source[key]);
			if (isBlank(entry)) return;
			if (
				typeof entry === 'object' &&
				entry !== null &&
				!Array.isArray(entry) &&
				Object.keys(entry).length === 0
			) {
				return;
			}
			out[key] = entry;
		});
		return out;
	}
	return value;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

interface ApiErrorBody {
	code?: string;
	message?: string;
	requestId?: string;
	upgradeUrl?: string;
}

const AUTH_MESSAGE = 'Your Prolifik API key is invalid, expired or revoked';
const AUTH_DESCRIPTION =
	`Create a new key in Prolifik under Settings > Developer API (${KEY_SETTINGS_URL}) and update ` +
	'the Prolifik credential. Keys expire after the 30, 90 or 365 days picked when they were made.';

const headerOf = (headers: Record<string, unknown>, name: string): string | undefined => {
	const match = Object.keys(headers || {}).find((key) => key.toLowerCase() === name);
	if (!match) return undefined;
	const value = headers[match];
	return Array.isArray(value) ? String(value[0]) : value === undefined ? undefined : String(value);
};

/** Retry-After in whole seconds, or undefined. */
export const retryAfterOf = (response: FullResponse): number | undefined => {
	const seconds = parseInt(headerOf(response.headers, 'retry-after') ?? '', 10);
	return Number.isNaN(seconds) ? undefined : seconds;
};

/** The API's own message, unless it is a bare machine code like "connection_locked". */
const apiMessageOf = (error: ApiErrorBody): string => {
	const message = typeof error.message === 'string' ? error.message.trim() : '';
	if (!message || /^[a-z0-9_]+$/.test(message)) return '';
	return message;
};

const withoutPeriod = (text: string) => text.replace(/[.!]$/, '');

const RETRY_HINT = 'Turn on Retry On Fail in the node settings to retry automatically.';

/**
 * A NodeApiError whose message and description a workflow builder can act on,
 * built from the API's own `error.message`.
 */
export const apiError = (node: INode, response: FullResponse): NodeApiError => {
	const status = response.statusCode;
	const body =
		response.body && typeof response.body === 'object' ? (response.body as IDataObject) : {};
	const error = (body.error && typeof body.error === 'object' ? body.error : {}) as ApiErrorBody;
	const apiMessage = apiMessageOf(error);
	const code = typeof error.code === 'string' ? error.code : undefined;
	const retryAfter = retryAfterOf(response);
	const retryText =
		retryAfter !== undefined ? `Retry after ${retryAfter} seconds. ${RETRY_HINT}` : RETRY_HINT;

	let message: string;
	let description: string | undefined;

	if (status === 401) {
		message = AUTH_MESSAGE;
		description = AUTH_DESCRIPTION;
	} else if (status === 403 && code === 'insufficient_scope') {
		message = withoutPeriod(apiMessage || 'This API key is missing a scope this step needs');
		description =
			`Create a key with the ${REQUIRED_SCOPES.join(', ')} scopes under Settings > Developer API ` +
			'in Prolifik, then update the Prolifik credential.';
	} else if (status === 403) {
		message = withoutPeriod(apiMessage || 'Your Prolifik account does not have access to this');
	} else if (status === 402) {
		const upgradeUrl =
			typeof error.upgradeUrl === 'string' && error.upgradeUrl.startsWith('https://')
				? error.upgradeUrl
				: PRICING_URL;
		message = withoutPeriod(
			apiMessage || 'Your Prolifik plan does not include this, or its monthly allowance is used up',
		);
		description = `Plans and limits: ${upgradeUrl}`;
	} else if (status === 429) {
		message = withoutPeriod(apiMessage || 'Prolifik is rate limiting requests');
		description = retryText;
	} else if (status === 409 && retryAfter !== undefined) {
		// The one 409 with a Retry-After: the same Idempotency-Key is still in
		// flight. A retry sends the same key and gets the first try's response.
		message = withoutPeriod(apiMessage || 'Prolifik is still processing this step');
		description = retryText;
	} else if (status === 404) {
		message = withoutPeriod(
			apiMessage || 'Prolifik could not find that item. It may have been deleted',
		);
	} else if (status >= 500) {
		message = withoutPeriod(
			apiMessage ||
				`Prolifik is having trouble right now (HTTP ${status}). Try again in a few minutes`,
		);
		description =
			typeof error.requestId === 'string' ? `Request ID: ${error.requestId}` : undefined;
	} else {
		message = withoutPeriod(apiMessage || `Prolifik rejected the request (HTTP ${status})`);
	}

	return new NodeApiError(
		node,
		{ ...(body as JsonObject), code: code ?? null, status } as JsonObject,
		{ message, description, httpCode: String(status) },
	);
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

interface RequestSpec {
	method?: IHttpRequestMethods;
	path: string;
	qs?: Record<string, unknown>;
	body?: Record<string, unknown>;
	/** Body keys sent even when they are empty strings (the publish caption). */
	keepEmpty?: string[];
	idempotency?: { kind: DedupeKind; scope?: IdempotencyScope };
}

const apiRequest = async (
	api: ApiContext,
	{ method = 'GET', path, qs, body, keepEmpty = [], idempotency }: RequestSpec,
): Promise<IDataObject> => {
	const options: IHttpRequestOptions = { method, url: `${API_BASE}${path}` };
	options.headers = { Accept: 'application/json' };
	if (qs) options.qs = compact(qs) as IDataObject;
	if (body) {
		const sent = compact(body) as IDataObject;
		keepEmpty.forEach((key) => {
			if (typeof body[key] === 'string' && !(key in sent)) sent[key] = body[key] as string;
		});
		options.body = sent;
	}
	if (idempotency) {
		options.headers['Idempotency-Key'] = idempotencyKey({
			kind: idempotency.kind,
			method,
			path,
			body: options.body,
			scope: idempotency.scope,
		});
	}
	const response = await api.request(options);
	if (response.statusCode >= 400) throw apiError(api.node, response);
	return response.body && typeof response.body === 'object' ? (response.body as IDataObject) : {};
};

export const apiGet = (api: ApiContext, path: string, qs?: Record<string, unknown>) =>
	apiRequest(api, { path, qs });

/**
 * Every write says how a repeat of it is recognised: `dedupe` is 'post' for
 * public posts and 'job' for anything that queues work (idempotency.ts). The
 * API refuses creates without an Idempotency-Key, and there is no way to
 * send one without a kind.
 */
export const apiPost = (
	api: ApiContext,
	path: string,
	body: Record<string, unknown>,
	options: { dedupe: DedupeKind; scope?: IdempotencyScope; keepEmpty?: string[] },
) =>
	apiRequest(api, {
		method: 'POST',
		path,
		body,
		keepEmpty: options.keepEmpty,
		idempotency: { kind: options.dedupe, scope: options.scope },
	});

/** The HTTP status of an error apiError built, or null. */
export const statusOfError = (error: unknown): number | null => {
	if (!(error instanceof NodeApiError)) return null;
	const status = Number(error.httpCode);
	return Number.isFinite(status) ? status : null;
};
