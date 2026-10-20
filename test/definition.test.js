'use strict';

// Guards on the package and node definitions that n8n's verification checks
// or that the Zapier integration taught us the hard way.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DIST } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const { Prolifik } = require(`${DIST}/nodes/Prolifik/Prolifik.node.js`);
const { ProlifikTrigger } = require(`${DIST}/nodes/Prolifik/ProlifikTrigger.node.js`);
const { ProlifikApi } = require(`${DIST}/credentials/ProlifikApi.credentials.js`);

const action = new Prolifik().description;
const trigger = new ProlifikTrigger().description;
const credential = new ProlifikApi();

/** Every string a user reads in the node UI. */
const userText = (properties) =>
	properties.flatMap((property) => [
		property.displayName,
		property.description,
		property.placeholder,
		...(property.options || []).flatMap((option) =>
			option.values ? userText(option.values) : [option.name, option.displayName, option.description, option.action],
		),
		...(property.options || []).filter((option) => option.type).flatMap((option) => userText([option])),
	]).filter((text) => typeof text === 'string');

describe('package', () => {
	it('has no runtime dependencies (n8n verification rule)', () => {
		assert.equal(pkg.dependencies, undefined);
		assert.deepEqual(Object.keys(pkg.peerDependencies), ['n8n-workflow']);
	});

	it('is named, tagged and linked for the n8n community listing', () => {
		assert.equal(pkg.name, 'n8n-nodes-prolifik');
		assert.ok(pkg.keywords.includes('n8n-community-node-package'));
		assert.equal(pkg.homepage, 'https://getprolifik.com');
		assert.equal(pkg.license, 'MIT');
		assert.equal(pkg.repository.url, 'git+https://github.com/BitMamba24/n8n-nodes-prolifik.git');
		assert.deepEqual(pkg.files, ['dist']);
	});

	it('sends every request through shared/http.ts, where writes cannot skip the Idempotency-Key', () => {
		const sources = (dir) =>
			fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) return sources(full);
				return entry.name.endsWith('.ts') ? [full] : [];
			});
		const offenders = sources(path.join(ROOT, 'nodes'))
			.filter((file) => !file.endsWith(path.join('shared', 'http.ts')))
			.filter((file) => /helpers\.httpRequest|\['Idempotency-Key'\]|randomUUID\(/.test(fs.readFileSync(file, 'utf8')));
		assert.deepEqual(offenders.map((file) => path.relative(ROOT, file)), [
			path.join('nodes', 'Prolifik', 'shared', 'idempotency.ts'),
		]);
	});

	it('registers files that the build produced', () => {
		[...pkg.n8n.nodes, ...pkg.n8n.credentials].forEach((file) =>
			assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing after the build`),
		);
		['prolifik.svg', 'prolifik.dark.svg', 'Prolifik.node.json', 'ProlifikTrigger.node.json'].forEach((file) =>
			assert.ok(fs.existsSync(path.join(ROOT, 'dist/nodes/Prolifik', file)), `${file} is not copied to dist`),
		);
	});
});

describe('credential', () => {
	it('sends the key as a bearer token and tests it against the API', () => {
		assert.equal(credential.name, 'prolifikApi');
		assert.equal(credential.properties[0].typeOptions.password, true);
		assert.match(credential.authenticate.properties.headers.Authorization, /"Bearer " \+/);
		assert.equal(credential.test.request.baseURL, 'https://app.getprolifik.com/api/v1');
		assert.equal(credential.test.request.url, '/usage');
	});

	it('is the credential both nodes use', () => {
		[action, trigger].forEach((description) =>
			assert.deepEqual(description.credentials, [{ name: 'prolifikApi', required: true }]),
		);
	});
});

describe('node definitions', () => {
	it('offers every Zapier trigger and action', () => {
		const operations = action.properties
			.filter((property) => property.name === 'operation')
			.flatMap((property) =>
				property.options.map((option) => `${property.displayOptions.show.resource[0]}:${option.value}`),
			);
		assert.deepEqual(operations.sort(), [
			'brand:find',
			'clip:create',
			'clip:publish',
			'contentSource:add',
			'video:create',
			'video:publish',
		]);
		const events = trigger.properties.find((property) => property.name === 'event').options.map((o) => o.value);
		assert.deepEqual(events, ['newClip', 'newVideo']);
		assert.equal(trigger.polling, true);
		assert.deepEqual(trigger.inputs, []);
	});

	it('points every dynamic dropdown at a load method that exists', () => {
		const methods = new Prolifik().methods.loadOptions;
		const triggerMethods = new ProlifikTrigger().methods.loadOptions;
		const walk = (properties, available) =>
			properties.forEach((property) => {
				const method = property.typeOptions && property.typeOptions.loadOptionsMethod;
				if (method) assert.equal(typeof available[method], 'function', `${property.name} -> ${method}`);
				(property.options || []).forEach((option) => {
					if (option.type) walk([option], available);
					if (option.values) walk(option.values, available);
				});
			});
		walk(action.properties, methods);
		walk(trigger.properties, triggerMethods);
	});

	it('reloads brand-scoped dropdowns when the Brand changes', () => {
		const scoped = ['getDestinations', 'getClipDestinations', 'getVideos', 'getContentSources'];
		const all = action.properties.flatMap((property) => [property, ...(property.options || []).filter((o) => o.type)]);
		const found = all.filter((property) => scoped.includes(property.typeOptions && property.typeOptions.loadOptionsMethod));
		assert.equal(found.length, 4);
		found.forEach((property) =>
			assert.deepEqual(property.typeOptions.loadOptionsDependsOn, ['brandId'], property.name),
		);
	});

	it('warns before every operation that posts publicly', () => {
		['clip', 'video'].forEach((resource) => {
			const notice = action.properties.find(
				(property) =>
					property.type === 'notice' &&
					property.displayOptions.show.resource[0] === resource &&
					property.displayOptions.show.operation[0] === 'publish',
			);
			assert.ok(notice, `${resource} publish has no public-post notice`);
			assert.match(notice.displayName, /posts publicly/);
		});
	});

	it('keeps em dashes, curly quotes and arrows out of user-facing text', () => {
		const texts = [
			...userText(action.properties),
			...userText(trigger.properties),
			...userText(credential.properties),
			action.description,
			trigger.description,
		];
		assert.ok(texts.length > 100);
		texts.forEach((text) => assert.doesNotMatch(text, /[—–‘’“”→↗»›]/, text));
	});

	it('only links to HTTPS URLs in descriptions', () => {
		const texts = [...userText(action.properties), ...userText(trigger.properties), ...userText(credential.properties)];
		texts.forEach((text) => assert.doesNotMatch(text, /http:\/\//, text));
	});
});
