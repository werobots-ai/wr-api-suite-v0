import fs from "fs/promises";
import path from "path";

import { IdentityStoreData } from "../../types/Identity";
import { IDENTITY_FILE } from "./config";
import { createBootstrapIdentity } from "./bootstrap";
import {
  applyStoreSideEffects,
  normalizeIdentity,
  syncInternalOrgIds,
} from "./identityNormalization";

function identityDirectory(): string {
  return path.dirname(IDENTITY_FILE);
}

async function ensureDirectory(): Promise<void> {
  await fs.mkdir(identityDirectory(), { recursive: true });
}

async function writeIdentityFile(store: IdentityStoreData): Promise<void> {
  await ensureDirectory();
  await fs.writeFile(IDENTITY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

async function readIdentityFile(): Promise<IdentityStoreData | null> {
  try {
    const raw = await fs.readFile(IDENTITY_FILE, "utf-8");
    return JSON.parse(raw) as IdentityStoreData;
  } catch {
    return null;
  }
}

export async function saveIdentity(store: IdentityStoreData): Promise<void> {
  const normalized = normalizeIdentity(store);
  await writeIdentityFile(normalized);
  syncInternalOrgIds(normalized.organizations);
}

export async function loadIdentity(): Promise<IdentityStoreData> {
  const stored = await readIdentityFile();
  if (stored) return applyStoreSideEffects(stored);
  const bootstrap = await createBootstrapIdentity();
  await saveIdentity(bootstrap);
  return applyStoreSideEffects(bootstrap);
}

export async function getIdentityStore(): Promise<IdentityStoreData> {
  return loadIdentity();
}
