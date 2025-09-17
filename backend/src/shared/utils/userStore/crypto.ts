import crypto from "crypto";

import { HASH_SECRET, KEY_SECRET } from "./config";

export function deriveEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(KEY_SECRET).digest();
}

export function hashApiKey(key: string): string {
  return crypto.createHmac("sha256", HASH_SECRET).update(key).digest("hex");
}

export function encryptValue(value: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptValue(
  encrypted: string,
  iv: string,
  authTag: string,
): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}
