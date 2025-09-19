import { IdentityStoreData } from "../../types/Identity";
import { setInternalOrgIds } from "./config";
import { normalizeOrganizations, collectMasterOrgIds } from "./normalizeOrganizations";
import { normalizeUsers } from "./normalizeUsers";

function normalizeMetadata(
  metadata: IdentityStoreData["metadata"] | null | undefined,
): IdentityStoreData["metadata"] {
  return { bootstrapCompletedAt: metadata?.bootstrapCompletedAt ?? null };
}

export function normalizeIdentity(store: IdentityStoreData): IdentityStoreData {
  return {
    users: normalizeUsers(store.users),
    organizations: normalizeOrganizations(store.organizations),
    auditLog: store.auditLog ?? [],
    metadata: normalizeMetadata(store.metadata),
  };
}

export function syncInternalOrgIds(
  organizations: IdentityStoreData["organizations"],
): void {
  setInternalOrgIds(collectMasterOrgIds(organizations));
}

export function applyStoreSideEffects(store: IdentityStoreData): IdentityStoreData {
  const normalized = normalizeIdentity(store);
  syncInternalOrgIds(normalized.organizations);
  return normalized;
}
