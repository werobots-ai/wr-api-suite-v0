import fs from "fs/promises";
import path from "path";

import { IdentityStoreData } from "../../types/Identity";
import { IDENTITY_FILE } from "./config";
import { createBootstrapIdentity } from "./bootstrap";

async function ensureDirectory() {
  await fs.mkdir(path.dirname(IDENTITY_FILE), { recursive: true });
}

export async function saveIdentity(store: IdentityStoreData): Promise<void> {
  await ensureDirectory();
  await fs.writeFile(IDENTITY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function loadIdentity(): Promise<IdentityStoreData> {
  try {
    const raw = await fs.readFile(IDENTITY_FILE, "utf-8");
    return JSON.parse(raw) as IdentityStoreData;
  } catch {
    const bootstrap = await createBootstrapIdentity();
    await saveIdentity(bootstrap);
    return bootstrap;
  }
}

export async function getIdentityStore(): Promise<IdentityStoreData> {
  return loadIdentity();
}
