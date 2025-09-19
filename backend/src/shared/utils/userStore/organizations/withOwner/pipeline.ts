import { now } from "../../time";
import { createDefaultKeySet } from "../../apiKeys";
import { buildOwner } from "./owner";
import { buildOrganization } from "./organization";
import { createIdentifiers, defaultProducts } from "./products";
import type { CreateOptions, CreateParams, Creation } from "./types";

export function buildCreation(
  params: CreateParams,
  options: CreateOptions,
): Creation {
  const ids = createIdentifiers(options);
  const createdAt = now();
  const products = defaultProducts();
  const keySet = createDefaultKeySet(ids.ownerId);
  const owner = buildOwner(params, options, ids, createdAt, products);
  const organization = buildOrganization(
    params,
    options,
    ids,
    createdAt,
    products,
    keySet,
  );
  return { owner, organization, keySet };
}
