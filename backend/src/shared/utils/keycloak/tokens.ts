import crypto from "node:crypto";
import type { JsonWebKey as NodeJsonWebKey } from "node:crypto";

import { getKeycloakConfig, keycloakIssuerUrl } from "./config";
import { keycloakFetch } from "./http";

type TokenPayload = {
  userId: string;
  email?: string;
  preferredUsername?: string;
  name?: string;
  raw: Record<string, unknown>;
};

type CachedKey = {
  publicKey: crypto.KeyObject;
  alg: string;
};

type KeycloakJwk = NodeJsonWebKey & { kid?: string; alg?: string };

type JwksResponse = {
  keys: KeycloakJwk[];
};

let jwksCache: {
  keys: Map<string, CachedKey>;
  expiresAt: number;
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

function base64UrlDecode(segment: string): Buffer {
  return Buffer.from(segment, "base64url");
}

function parseSegment<T>(segment: string): T {
  const json = base64UrlDecode(segment).toString("utf-8");
  return JSON.parse(json) as T;
}

async function fetchJwks(): Promise<Map<string, CachedKey>> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) {
    return jwksCache.keys;
  }
  const config = getKeycloakConfig();
  const issuer = keycloakIssuerUrl();
  const url = `${issuer}/protocol/openid-connect/certs`;
  const res = await keycloakFetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Keycloak JWKS (${res.status}): ${text}`);
  }
  const data = (await res.json()) as JwksResponse;
  const keys = new Map<string, CachedKey>();
  for (const jwk of data.keys) {
    if (!jwk.kid) continue;
    try {
      const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
      keys.set(jwk.kid, {
        publicKey,
        alg: jwk.alg || "RS256",
      });
    } catch (error) {
      console.warn("Failed to parse Keycloak JWK", error);
    }
  }
  jwksCache = {
    keys,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return keys;
}

function validateIssuer(payload: Record<string, unknown>) {
  const issuer = keycloakIssuerUrl();
  if (payload["iss"] !== issuer) {
    throw new Error("Token issuer mismatch");
  }
}

function validateExpiration(payload: Record<string, unknown>) {
  const exp = payload["exp"];
  if (typeof exp !== "number") {
    throw new Error("Token missing expiration");
  }
  const expiry = exp * 1000;
  if (Date.now() >= expiry) {
    throw new Error("Token has expired");
  }
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new Error("Invalid JWT structure");
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const header = parseSegment<Record<string, unknown>>(headerSegment);
  const kid = typeof header["kid"] === "string" ? (header["kid"] as string) : null;
  const alg = typeof header["alg"] === "string" ? (header["alg"] as string) : "RS256";
  if (!kid) {
    throw new Error("Token missing key identifier");
  }
  const jwks = await fetchJwks();
  const cached = jwks.get(kid);
  if (!cached) {
    throw new Error(`Unknown signing key: ${kid}`);
  }
  if (cached.alg !== alg) {
    throw new Error(`Token algorithm mismatch: expected ${cached.alg} got ${alg}`);
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();
  const signature = base64UrlDecode(signatureSegment);
  const valid = verifier.verify(cached.publicKey, signature);
  if (!valid) {
    throw new Error("Invalid token signature");
  }
  const payload = parseSegment<Record<string, unknown>>(payloadSegment);
  validateIssuer(payload);
  validateExpiration(payload);
  const userId = typeof payload["sub"] === "string" ? (payload["sub"] as string) : null;
  if (!userId) {
    throw new Error("Token missing subject");
  }
  const email = typeof payload["email"] === "string" ? (payload["email"] as string) : undefined;
  const preferredUsername =
    typeof payload["preferred_username"] === "string"
      ? (payload["preferred_username"] as string)
      : undefined;
  const name = typeof payload["name"] === "string" ? (payload["name"] as string) : undefined;
  return {
    userId,
    email,
    preferredUsername,
    name,
    raw: payload,
  };
}

export async function authenticateWithPassword(
  username: string,
  password: string,
): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
  const config = getKeycloakConfig();
  const tokenUrl = `${config.baseUrl}/realms/${config.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("client_id", config.clientId);
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }
  body.set("username", username);
  body.set("password", password);
  const res = await keycloakFetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keycloak authentication failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Keycloak authentication response missing access_token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 0,
  };
}
