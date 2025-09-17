import fs from "fs/promises";
import path from "path";

import { IdentityStoreData } from "../../types/Identity";
import { IDENTITY_FILE, setInternalOrgIds } from "./config";
import { createBootstrapIdentity } from "./bootstrap";
import { normalizeProductConfigs } from "./productConfig";

function normalizeIdentity(store: IdentityStoreData): IdentityStoreData {
  const users = Object.fromEntries(
    Object.entries(store.users || {}).map(([id, user]) => {
      const organizations = (user.organizations || []).map((link) => ({
        ...link,
        roles: Array.isArray(link.roles) ? link.roles : [],
        productAccess: normalizeProductConfigs(link.productAccess, {
          ensureDocument: true,
        }),
      }));
      return [
        id,
        {
          ...user,
          organizations,
        },
      ];
    }),
  );

  const organizations = Object.fromEntries(
    Object.entries(store.organizations || {}).map(([id, org]) => {
      const keySets = (org.keySets || []).map((set) => ({
        ...set,
        products: normalizeProductConfigs(set.products, {
          ensureDocument: true,
        }),
      }));
      const members = (org.members || []).map((member) => ({
        ...member,
        roles: Array.isArray(member.roles) ? member.roles : [],
        productAccess: normalizeProductConfigs(member.productAccess, {
          ensureDocument: true,
        }),
        usage: Array.isArray(member.usage) ? member.usage : [],
        lastAccessed: member.lastAccessed ?? null,
      }));
      return [
        id,
        {
          ...org,
          keySets,
          members,
          isMaster: Boolean(org.isMaster),
        },
      ];
    }),
  );

  return {
    users,
    organizations,
    auditLog: store.auditLog || [],
    metadata: {
      bootstrapCompletedAt: store.metadata?.bootstrapCompletedAt ?? null,
    },
  };
}

function applyStoreSideEffects(store: IdentityStoreData): IdentityStoreData {
  const normalized = normalizeIdentity(store);
  const masterOrgIds = Object.values(normalized.organizations)
    .filter((org) => org.isMaster)
    .map((org) => org.id);
  setInternalOrgIds(masterOrgIds);
  return normalized;
}

async function ensureDirectory() {
  await fs.mkdir(path.dirname(IDENTITY_FILE), { recursive: true });
}

export async function saveIdentity(store: IdentityStoreData): Promise<void> {
  const normalized = normalizeIdentity(store);
  await ensureDirectory();
  await fs.writeFile(IDENTITY_FILE, JSON.stringify(normalized, null, 2), "utf-8");
  const masterOrgIds = Object.values(normalized.organizations)
    .filter((org) => org.isMaster)
    .map((org) => org.id);
  setInternalOrgIds(masterOrgIds);
}

export async function loadIdentity(): Promise<IdentityStoreData> {
  try {
    const raw = await fs.readFile(IDENTITY_FILE, "utf-8");
    const parsed = JSON.parse(raw) as IdentityStoreData;
    return applyStoreSideEffects(parsed);
  } catch {
    const bootstrap = await createBootstrapIdentity();
    await saveIdentity(bootstrap);
    return applyStoreSideEffects(bootstrap);
  }
}

export async function getIdentityStore(): Promise<IdentityStoreData> {
  return loadIdentity();
}
