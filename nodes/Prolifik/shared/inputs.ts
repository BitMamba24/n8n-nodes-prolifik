import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { isBlank } from './http';

/** A whole number from a parameter, or undefined when blank. */
export const toInt = (node: INode, value: unknown, label: string): number | undefined => {
	if (isBlank(value)) return undefined;
	const parsed = Number(String(value).trim());
	if (!Number.isInteger(parsed)) {
		throw new NodeOperationError(node, `${label} must be a whole number`);
	}
	return parsed;
};

/** true/false from a boolean parameter or a mapped "true"/"yes", or undefined. */
export const toBool = (value: unknown): boolean | undefined => {
	if (typeof value === 'boolean') return value;
	if (isBlank(value)) return undefined;
	const text = String(value).trim().toLowerCase();
	if (['true', 'yes', '1', 'on'].includes(text)) return true;
	if (['false', 'no', '0', 'off'].includes(text)) return false;
	return undefined;
};

/** A list parameter's values as trimmed strings; a mapped "a, b" string splits on commas. */
export const toList = (value: unknown, { splitCommas = true } = {}): string[] => {
	if (isBlank(value)) return [];
	const raw = Array.isArray(value) ? value : [value];
	const out: string[] = [];
	raw.forEach((entry) => {
		if (isBlank(entry)) return;
		const parts = splitCommas ? String(entry).split(',') : [String(entry)];
		parts.forEach((part) => {
			const text = part.trim();
			if (text) out.push(text);
		});
	});
	return out;
};

/** Hashtags from text or a list: split on spaces and commas, keep the user's #. */
export const toHashtags = (value: unknown): string[] =>
	toList(value)
		.flatMap((entry) => entry.split(/\s+/))
		.map((tag) => tag.trim())
		.filter((tag) => tag && tag !== '#');

export const trimmed = (value: unknown): string | undefined =>
	isBlank(value) ? undefined : String(value).trim();

// The API's rule (src/lib/validate-uuid.ts). A Brand set by an expression
// reaches a dropdown unresolved (for example "={{ $json.brandId }}") and fails
// this test, so dropdowns never send it to the API.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
	typeof value === 'string' && UUID.test(value.trim());

/**
 * Custom texts in video order: the API reads entry N as video N's text and a
 * null entry lets the AI write that video. A blank entry (an empty row, or an
 * expression that is empty this run) becomes null so the texts after it stay
 * on their own videos; trailing blanks are dropped. Carousel entries list
 * slides separated by "|".
 */
export const customTextsFor = (
	node: INode,
	entries: unknown[],
	format: string | undefined,
	count: number,
): Array<{ text: string } | { slides: string[] } | null> | undefined => {
	const out = entries.map((entry) => {
		if (isBlank(entry)) return null;
		if (format === 'carousel') {
			const slides = String(entry)
				.split('|')
				.map((slide) => slide.trim())
				.filter(Boolean);
			return slides.length > 0 ? { slides } : null;
		}
		const text = String(entry).trim();
		return text ? { text } : null;
	});
	while (out.length > 0 && out[out.length - 1] === null) out.pop();
	if (out.length === 0) return undefined;
	if (out.length > count) {
		throw new NodeOperationError(
			node,
			`Your Own Text has an entry for video ${out.length}, but Number of Videos is ${count}`,
			{ description: 'Raise Number of Videos or remove some texts.' },
		);
	}
	return out;
};
