import type { IDataObject } from 'n8n-workflow';

import type { ApiContext } from './http';
import { apiGet, isBlank } from './http';
import { isUuid } from './inputs';
import { brandItem, destinationItem } from './items';

// Brands read when the Brand field is an expression: one request each, in parallel.
const MAX_BRANDS = 20;

const accountsOf = (data: IDataObject): IDataObject[] =>
	(Array.isArray(data.destinations) ? (data.destinations as IDataObject[]) : []).filter(
		(destination) => destination && destination.id,
	);

/**
 * Social accounts for a dropdown, read from `path` (/publish-destinations, or
 * its Clipper copy for keys with only the clipper scopes).
 *
 * A picked Brand lists that brand's accounts; no Brand lists the active
 * brand's (the API's default). A Brand set by an expression reaches the
 * dropdown unresolved and the API would refuse it, so every brand's accounts
 * are listed, each named with its brand. The operation itself checks the
 * account against the brand when it runs (the API for Publish Video, the node
 * for Publish Clip).
 */
export const listDestinations = async (api: ApiContext, path: string, brandId: unknown) => {
	if (isBlank(brandId) || isUuid(brandId)) {
		const data = await apiGet(api, path, {
			brandId: isBlank(brandId) ? undefined : String(brandId).trim(),
		});
		return accountsOf(data).map(destinationItem);
	}

	const data = await apiGet(api, '/brands');
	const brands = (Array.isArray(data.brands) ? (data.brands as IDataObject[]) : [])
		.map(brandItem)
		.filter((brand) => brand.is_active && isUuid(brand.id))
		.slice(0, MAX_BRANDS);
	const perBrand = await Promise.all(
		brands.map(async (brand) =>
			accountsOf(await apiGet(api, path, { brandId: brand.id })).map((account) => {
				const item = destinationItem(account);
				return { ...item, label: `${brand.name}: ${item.label}` };
			}),
		),
	);
	return perBrand.flat();
};
