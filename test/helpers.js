'use strict';

// Test doubles for the n8n function contexts. No network: every request goes
// to a scripted fake that checks the method and URL in order and records what
// was sent. Tests run against the compiled dist/ (npm test builds first).

const assert = require('node:assert/strict');

const DIST = '../dist';
const API = 'https://app.getprolifik.com/api/v1';

const { Prolifik } = require(`${DIST}/nodes/Prolifik/Prolifik.node.js`);
const { ProlifikTrigger } = require(`${DIST}/nodes/Prolifik/ProlifikTrigger.node.js`);

const NODE = {
	id: 'node-1',
	name: 'Prolifik',
	type: 'n8n-nodes-prolifik.prolifik',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const BRAND = '5b0e8d34-7c21-4f9a-a6d2-93e1c4b7f058';
const BRAND_2 = '6c1f9e45-8d32-4a0b-b7e3-a4f2d5c8e169';
const ACCOUNT = '9e4f6a1c-2b3d-4c5e-8f70-a1b2c3d4e5f6';
const ACCOUNT_2 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

/**
 * A scripted API. `script` is a list of { method, path, query?, status?,
 * body?, headers? }; each request must match the next entry. `path` is
 * compared with the URL after the API base, without the query string.
 */
const fakeApi = (script) => {
	const queue = [...script];
	const calls = [];
	const request = async (options) => {
		const next = queue.shift();
		const url = String(options.url);
		assert.ok(next, `unexpected request ${options.method} ${url}`);
		assert.ok(url.startsWith(API), `request left the API: ${url}`);
		assert.equal(options.method || 'GET', next.method || 'GET', `method of ${url}`);
		assert.equal(url.slice(API.length), next.path, 'request path');
		if (next.query) assert.deepEqual(options.qs || {}, next.query, `query of ${url}`);
		calls.push(options);
		return {
			statusCode: next.status || 200,
			headers: next.headers || {},
			body: next.body === undefined ? {} : next.body,
		};
	};
	const done = () => assert.deepEqual(queue, [], 'requests the script expected but never got');
	return { request, calls, done };
};

/** An ApiContext for the shared modules. */
const apiWith = (script) => {
	const fake = fakeApi(script);
	return { api: { node: NODE, request: fake.request }, ...fake };
};

const paramReader = (values) => (name, fallback) => {
	if (values[name] !== undefined) return values[name];
	if (fallback !== undefined) return fallback;
	throw new Error(`Could not get parameter "${name}"`);
};

/**
 * An IExecuteFunctions double. `params` is one object per input item (or one
 * object for a single item).
 */
const executeContext = ({
	params,
	script = [],
	executionId = 'exec-1',
	workflowId = 'wf-1',
	continueOnFail = false,
}) => {
	const perItem = Array.isArray(params) ? params : [params];
	const fake = fakeApi(script);
	const credentials = [];
	const ctx = {
		getInputData: () => perItem.map(() => ({ json: {} })),
		getNodeParameter: (name, itemIndex, fallback) => paramReader(perItem[itemIndex])(name, fallback),
		getNode: () => NODE,
		getWorkflow: () => ({ id: workflowId, active: true }),
		getExecutionId: () => executionId,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication(credentialName, options) {
				credentials.push(credentialName);
				return fake.request(options);
			},
		},
	};
	return { ctx, credentials, ...fake };
};

const execute = async (args) => {
	const harness = executeContext(args);
	const node = new Prolifik();
	const [output] = await node.execute.call(harness.ctx);
	return { output, ...harness };
};

/** An IPollFunctions double sharing `staticData` across polls. */
const pollContext = ({ params, script = [], mode = 'trigger', staticData = {} }) => {
	const fake = fakeApi(script);
	const ctx = {
		getNodeParameter: paramReader(params),
		getMode: () => mode,
		getNode: () => NODE,
		getWorkflowStaticData: () => staticData,
		helpers: {
			httpRequestWithAuthentication: (_name, options) => fake.request(options),
			returnJsonArray: (list) => list.map((json) => ({ json })),
		},
	};
	return { ctx, staticData, ...fake };
};

const poll = async (args) => {
	const harness = pollContext(args);
	const result = await new ProlifikTrigger().poll.call(harness.ctx);
	return { result, ...harness };
};

/** An ILoadOptionsFunctions double. */
const loadOptions = async (method, { params = {}, script = [] }) => {
	const fake = fakeApi(script);
	const ctx = {
		getCurrentNodeParameter: (name) => params[name],
		getNode: () => NODE,
		helpers: { httpRequestWithAuthentication: (_name, options) => fake.request(options) },
	};
	const result = await new Prolifik().methods.loadOptions[method].call(ctx);
	return { result, ...fake };
};

const apiError = (code, message, extra = {}) => ({
	error: { code, message, requestId: 'req_test', ...extra },
});

/** The rejection of a promise, or a failed assertion if it resolved. */
const rejectionOf = async (promise) => {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	assert.fail('expected the call to fail');
};

const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

module.exports = {
	ACCOUNT,
	ACCOUNT_2,
	API,
	BRAND,
	BRAND_2,
	DIST,
	HOUR,
	MINUTE,
	NODE,
	apiError,
	apiWith,
	execute,
	executeContext,
	fakeApi,
	isoAgo,
	loadOptions,
	poll,
	rejectionOf,
};
