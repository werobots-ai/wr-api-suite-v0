import { v4 as uuid } from "uuid";

import type { KeySet } from "../../../types/Identity";
import type { ProductKeyConfig } from "../../../types/Products";
import { createStoredKeyFromPlain, generatePlainApiKey } from "../apiKeys";
import { normalizeProductConfigs } from "../productConfig";
import { loadIdentity, saveIdentity } from "../persistence";
import { toSafeKeySet, type SafeEntityOptions } from "../safeEntities";
import { now } from "../time";

type AddKeySetParams = {
  orgId: string;
  actorId: string;
  name: string;
  description: string;
  products: ProductKeyConfig[];
};

type KeySetCreation = {
  keySet: KeySet;
  revealed: string[];
};

type AddKeySetResult = {
  keySet: ReturnType<typeof toSafeKeySet>;
  revealedKeys: string[];
};

export async function addKeySet(
  params: AddKeySetParams,
  options: SafeEntityOptions = {},
): Promise<AddKeySetResult> {
  const store = await loadIdentity();
  const organization = store.organizations[params.orgId];
  if (!organization) throw new Error("Organization not found");
  const creation = buildKeySet(params);
  organization.keySets.push(creation.keySet);
  await saveIdentity(store);
  return {
    keySet: toSafeKeySet(creation.keySet, options),
    revealedKeys: creation.revealed,
  };
}

function buildKeySet(params: AddKeySetParams): KeySetCreation {
  const createdAt = now();
  const products = normalizeProductConfigs(params.products, {
    ensureDocument: true,
  });
  const [first, second] = [generatePlainApiKey(), generatePlainApiKey()];
  const keys = [
    createStoredKeyFromPlain(first, params.actorId),
    createStoredKeyFromPlain(second, params.actorId),
  ];
  return {
    keySet: {
      id: uuid(),
      name: params.name,
      description: params.description,
      keys,
      createdAt,
      createdBy: params.actorId,
      products,
    },
    revealed: [first, second],
  };
}
