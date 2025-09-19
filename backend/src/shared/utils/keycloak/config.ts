import { URL } from "url";

type KeycloakConfig = {
  enabled: boolean;
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  adminUsername: string;
  adminPassword: string;
};

const DEFAULTS = {
  baseUrl: "http://localhost:8080",
  realm: "werobots-local",
  clientId: "wr-console",
  clientSecret: "local-dev-secret",
  adminUsername: "admin",
  adminPassword: "admin",
};

function normalizeBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.pathname = "/";
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/?$/, "");
  } catch {
    return DEFAULTS.baseUrl;
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  return fallback;
}

let cachedConfig: KeycloakConfig | null = null;

export function getKeycloakConfig(): KeycloakConfig {
  if (cachedConfig) return cachedConfig;
  const enabled = parseBoolean(process.env.KEYCLOAK_ENABLED, true);
  const baseUrl = normalizeBaseUrl(
    process.env.KEYCLOAK_BASE_URL || DEFAULTS.baseUrl,
  );
  const realm = process.env.KEYCLOAK_REALM || DEFAULTS.realm;
  const clientId = process.env.KEYCLOAK_CLIENT_ID || DEFAULTS.clientId;
  const clientSecret =
    process.env.KEYCLOAK_CLIENT_SECRET || DEFAULTS.clientSecret;
  const adminUsername =
    process.env.KEYCLOAK_ADMIN_USERNAME || DEFAULTS.adminUsername;
  const adminPassword =
    process.env.KEYCLOAK_ADMIN_PASSWORD || DEFAULTS.adminPassword;

  cachedConfig = {
    enabled,
    baseUrl,
    realm,
    clientId,
    clientSecret,
    adminUsername,
    adminPassword,
  };
  return cachedConfig;
}

export function isKeycloakEnabled(): boolean {
  const config = getKeycloakConfig();
  return config.enabled;
}

export function keycloakIssuerUrl(): string {
  const { baseUrl, realm } = getKeycloakConfig();
  return `${baseUrl}/realms/${realm}`;
}

export type { KeycloakConfig };
