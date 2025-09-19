import { loadIdentity, saveIdentity } from "../../persistence";
import { buildCreation } from "./pipeline";
import { ensureOwnerIsNew } from "./validation";
import { persistCreation } from "./persist";
import { finalizeCreation } from "./result";
import type { CreateOptions, CreateParams, CreateResult } from "./types";
import { provisionOrganization } from "../../../keycloak/admin";

export async function createOrganizationWithOwner(
  params: CreateParams,
  options: CreateOptions = {},
): Promise<CreateResult> {
  const store = await loadIdentity();
  ensureOwnerIsNew(store, params.ownerEmail);
  const provision = await provisionOrganization(
    { name: params.organizationName, isMaster: Boolean(options.isMaster) },
    {
      email: params.ownerEmail,
      name: params.ownerName,
      password: params.ownerPassword,
      globalRoles: options.ownerGlobalRoles ?? [],
    },
  );
  const forcedIds = {
    ownerId: options.forcedIds?.ownerId ?? provision.ownerId,
    orgId: options.forcedIds?.orgId ?? provision.organizationId,
  };
  const creationOptions: CreateOptions = { ...options, forcedIds };
  const creation = buildCreation(params, creationOptions);
  persistCreation(store, creation, options);
  await saveIdentity(store);
  return finalizeCreation(creation);
}

export type { CreateParams, CreateOptions, CreateResult } from "./types";
