import crypto from "crypto";

import { getKeycloakConfig, KeycloakConfig } from "./config";
import { keycloakFetch } from "./http";
import { slugify } from "../userStore/helpers";

type AdminContext = {
  config: KeycloakConfig;
  token: string;
};

type ClientRepresentation = {
  id?: string;
  clientId: string;
  name?: string;
  enabled?: boolean;
  protocol?: string;
  secret?: string;
  directAccessGrantsEnabled?: boolean;
  serviceAccountsEnabled?: boolean;
  standardFlowEnabled?: boolean;
  publicClient?: boolean;
};

type RoleRepresentation = {
  id?: string;
  name: string;
  description?: string;
};

type GroupRepresentation = {
  id: string;
  name: string;
  path: string;
  attributes?: Record<string, string[]>;
};

type UserRepresentation = {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, string[]>;
};

type CreateUserParams = {
  email: string;
  name: string;
  password: string;
  roles: string[];
  organizationId: string;
};

type CreateGroupParams = {
  name: string;
  isMaster: boolean;
};

type ProvisionResult = {
  organizationId: string;
  ownerId: string;
};

const GLOBAL_ROLE_PREFIX = "wr_global_";
const ORG_ROLE_ATTRIBUTE = "wr_org_roles";
const ORG_ID_ATTRIBUTE = "wr_org_id";
const ORG_SLUG_ATTRIBUTE = "wr_org_slug";
const ORG_MASTER_ATTRIBUTE = "wr_org_master";

async function adminFetch(
  ctx: AdminContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${ctx.config.baseUrl}/admin/realms/${ctx.config.realm}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${ctx.token}`);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return keycloakFetch(url, { ...init, headers });
}

async function fetchJson<T>(
  ctx: AdminContext,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await adminFetch(ctx, path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Keycloak admin request failed (${res.status} ${res.statusText}): ${text}`,
    );
  }
  if (res.status === 204) {
    return null as unknown as T;
  }
  return (await res.json()) as T;
}

async function ensureRealm(ctx: AdminContext): Promise<void> {
  const url = `${ctx.config.baseUrl}/admin/realms/${ctx.config.realm}`;
  const res = await keycloakFetch(url, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (res.ok) return;
  if (res.status !== 404) {
    const text = await res.text();
    throw new Error(
      `Failed to inspect realm (${res.status} ${res.statusText}): ${text}`,
    );
  }

  const body = {
    realm: ctx.config.realm,
    enabled: true,
    displayName: "WeRobots",
  };
  const createRes = await keycloakFetch(`${ctx.config.baseUrl}/admin/realms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(
      `Failed to create realm (${createRes.status} ${createRes.statusText}): ${text}`,
    );
  }
}

async function ensureClient(ctx: AdminContext): Promise<ClientRepresentation> {
  const clients = await fetchJson<ClientRepresentation[]>(
    ctx,
    `/clients?clientId=${encodeURIComponent(ctx.config.clientId)}`,
  );
  const existing = clients.find((client) => client.clientId === ctx.config.clientId);
  if (existing) {
    const patched = {
      ...existing,
      serviceAccountsEnabled: true,
      directAccessGrantsEnabled: true,
      standardFlowEnabled: false,
      publicClient: false,
    } satisfies ClientRepresentation;
    await adminFetch(ctx, `/clients/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(patched),
    });
    if (!existing.secret || existing.secret !== ctx.config.clientSecret) {
      await adminFetch(ctx, `/clients/${existing.id}/client-secret`, {
        method: "POST",
        body: JSON.stringify({ value: ctx.config.clientSecret }),
      });
    }
    return { ...patched, secret: ctx.config.clientSecret };
  }

  const body = {
    clientId: ctx.config.clientId,
    name: "wr-console",
    enabled: true,
    protocol: "openid-connect",
    serviceAccountsEnabled: true,
    directAccessGrantsEnabled: true,
    standardFlowEnabled: false,
    publicClient: false,
    secret: ctx.config.clientSecret,
  } satisfies ClientRepresentation;
  const res = await adminFetch(ctx, "/clients", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to create client (${res.status} ${res.statusText}): ${text}`,
    );
  }
  const location = res.headers.get("location");
  const id = location ? location.split("/").pop() || crypto.randomUUID() : crypto.randomUUID();
  return {
    ...body,
    id,
    secret: ctx.config.clientSecret,
  };
}

async function ensureRealmRole(
  ctx: AdminContext,
  roleName: string,
  description: string,
): Promise<RoleRepresentation> {
  const res = await adminFetch(ctx, `/roles/${encodeURIComponent(roleName)}`);
  if (res.ok) {
    return (await res.json()) as RoleRepresentation;
  }
  if (res.status !== 404) {
    const text = await res.text();
    throw new Error(
      `Failed to inspect role (${res.status} ${res.statusText}): ${text}`,
    );
  }
  const body = { name: roleName, description } satisfies RoleRepresentation;
  const createRes = await adminFetch(ctx, "/roles", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(
      `Failed to create role (${createRes.status} ${createRes.statusText}): ${text}`,
    );
  }
  return body;
}

async function createGroup(
  ctx: AdminContext,
  params: CreateGroupParams,
): Promise<GroupRepresentation> {
  const body = {
    name: params.name,
    attributes: {
      [ORG_MASTER_ATTRIBUTE]: [params.isMaster ? "true" : "false"],
      [ORG_SLUG_ATTRIBUTE]: [slugify(params.name)],
    },
  };
  const res = await adminFetch(ctx, "/groups", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to create organization group (${res.status} ${res.statusText}): ${text}`,
    );
  }
  const location = res.headers.get("location");
  if (!location) {
    throw new Error("Keycloak group creation response missing location header");
  }
  const id = location.split("/").pop();
  if (!id) {
    throw new Error("Keycloak group creation response missing identifier");
  }
  return {
    id,
    name: params.name,
    path: location,
    attributes: body.attributes,
  };
}

async function createUser(
  ctx: AdminContext,
  params: CreateUserParams,
): Promise<UserRepresentation> {
  const firstName = params.name.trim();
  const body = {
    username: params.email,
    email: params.email,
    emailVerified: true,
    enabled: true,
    firstName,
    attributes: {
      [ORG_ID_ATTRIBUTE]: [params.organizationId],
      [ORG_ROLE_ATTRIBUTE]: [params.roles.join(",")],
    },
  };
  const res = await adminFetch(ctx, "/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to create user (${res.status} ${res.statusText}): ${text}`,
    );
  }
  const location = res.headers.get("location");
  if (!location) {
    throw new Error("Keycloak user creation response missing location header");
  }
  const id = location.split("/").pop();
  if (!id) {
    throw new Error("Keycloak user creation response missing identifier");
  }

  await adminFetch(ctx, `/users/${id}/reset-password`, {
    method: "PUT",
    body: JSON.stringify({
      type: "password",
      value: params.password,
      temporary: false,
    }),
  });

  return {
    id,
    username: params.email,
    email: params.email,
    firstName,
    attributes: body.attributes,
  };
}

async function assignUserToGroup(
  ctx: AdminContext,
  userId: string,
  groupId: string,
): Promise<void> {
  const res = await adminFetch(ctx, `/users/${userId}/groups/${groupId}`, {
    method: "PUT",
    body: "",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to assign user to group (${res.status} ${res.statusText}): ${text}`,
    );
  }
}

async function assignGlobalRoles(
  ctx: AdminContext,
  userId: string,
  roles: string[],
): Promise<void> {
  if (roles.length === 0) return;
  const roleRepresentations: RoleRepresentation[] = [];
  for (const role of roles) {
    const normalized = `${GLOBAL_ROLE_PREFIX}${role}`;
    const representation = await ensureRealmRole(
      ctx,
      normalized,
      `WeRobots global role ${role}`,
    );
    roleRepresentations.push(representation);
  }
  await adminFetch(ctx, `/users/${userId}/role-mappings/realm`, {
    method: "POST",
    body: JSON.stringify(roleRepresentations),
  });
}

export async function provisionOrganization(
  params: { name: string; isMaster: boolean },
  owner: { email: string; name: string; password: string; globalRoles: string[] },
): Promise<ProvisionResult> {
  const config = getKeycloakConfig();
  const token = await getAdminToken(config);
  const ctx: AdminContext = { config, token };
  await ensureRealm(ctx);
  await ensureClient(ctx);
  const group = await createGroup(ctx, {
    name: params.name,
    isMaster: params.isMaster,
  });
  const roles = owner.globalRoles;
  const user = await createUser(ctx, {
    email: owner.email,
    name: owner.name,
    password: owner.password,
    roles: ["OWNER", "ADMIN", "BILLING"],
    organizationId: group.id,
  });
  await assignUserToGroup(ctx, user.id, group.id);
  await assignGlobalRoles(ctx, user.id, roles);
  return {
    organizationId: group.id,
    ownerId: user.id,
  };
}

async function getAdminToken(config: KeycloakConfig): Promise<string> {
  const tokenUrl = `${config.baseUrl}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("client_id", "admin-cli");
  body.set("username", config.adminUsername);
  body.set("password", config.adminPassword);
  const res = await keycloakFetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to obtain admin token (${res.status} ${res.statusText}): ${text}`,
    );
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Keycloak admin token response missing access_token");
  }
  return data.access_token;
}
