import { loadIdentity, saveIdentity } from "../../persistence";
import { buildCreation } from "./pipeline";
import { ensureOwnerIsNew } from "./validation";
import { persistCreation } from "./persist";
import { finalizeCreation } from "./result";
import type { CreateOptions, CreateParams, CreateResult } from "./types";

export async function createOrganizationWithOwner(
  params: CreateParams,
  options: CreateOptions = {},
): Promise<CreateResult> {
  const store = await loadIdentity();
  ensureOwnerIsNew(store, params.ownerEmail);
  const creation = buildCreation(params, options);
  persistCreation(store, creation, options);
  await saveIdentity(store);
  return finalizeCreation(creation);
}

export type { CreateParams, CreateOptions, CreateResult } from "./types";
