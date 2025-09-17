import crypto from "crypto";
import { v4 as uuid } from "uuid";

import { KeySet, StoredApiKey } from "../../types/Identity";
import { decryptValue, encryptValue, hashApiKey } from "./crypto";
import { now } from "./time";

export function generatePlainApiKey(): string {
  const random = crypto.randomBytes(24).toString("hex");
  return `wr_${random}`;
}

export function createStoredKeyFromPlain(
  key: string,
  actorId: string,
): StoredApiKey {
  const { encrypted, iv, authTag } = encryptValue(key);
  const timestamp = now();
  return {
    id: uuid(),
    encryptedKey: encrypted,
    encryptionIv: iv,
    encryptionAuthTag: authTag,
    keyHash: hashApiKey(key),
    lastFour: key.slice(-4),
    lastRotated: timestamp,
    lastAccessed: null,
    usage: [],
    createdAt: timestamp,
    createdBy: actorId,
  };
}

export function createDefaultKeySet(actorId: string): KeySet {
  const createdAt = now();
  const keyA = createStoredKeyFromPlain(generatePlainApiKey(), actorId);
  const keyB = createStoredKeyFromPlain(generatePlainApiKey(), actorId);
  return {
    id: uuid(),
    name: "Default",
    description: "Initial key set",
    keys: [keyA, keyB],
    createdAt,
    createdBy: actorId,
  };
}

export function revealStoredKey(key: StoredApiKey): string {
  return decryptValue(key.encryptedKey, key.encryptionIv, key.encryptionAuthTag);
}
