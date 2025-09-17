import crypto from "crypto";

/**
 * Lightweight auth helpers used during local development.
 *
 * The module intentionally mimics the shape of what our Keycloak
 * integration will eventually provide: issue a token for a user and
 * validate incoming bearer tokens. Swapping in Keycloak later should be
 * as simple as replacing these functions with calls to the official
 * SDK.
 */

const sessions = new Map<string, { userId: string; issuedAt: number }>();

export function issueDevToken(userId: string): string {
  const token = `dev.${crypto.randomBytes(24).toString("hex")}`;
  sessions.set(token, { userId, issuedAt: Date.now() });
  return token;
}

export function verifyDevToken(token: string): { userId: string } | null {
  const session = sessions.get(token);
  if (!session) return null;
  return { userId: session.userId };
}

export function revokeDevToken(token: string): void {
  sessions.delete(token);
}

export function listActiveSessions(): { token: string; userId: string; issuedAt: number }[] {
  return Array.from(sessions.entries()).map(([token, data]) => ({
    token,
    userId: data.userId,
    issuedAt: data.issuedAt,
  }));
}
