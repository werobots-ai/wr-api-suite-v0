import { setKeycloakFetchOverride } from "../../src/shared/utils/keycloak/http";

export function installMockKeycloak(): () => void {
  const baseUrl = "http://localhost:8080";
  const realm = "werobots-local";
  const realmPath = `${baseUrl}/admin/realms/${realm}`;
  const realmPathname = new URL(realmPath).pathname;
  let clientCounter = 1;
  let groupCounter = 1;
  let userCounter = 1;
  const createdRoles = new Set<string>();
  const groups: {
    id: string;
    name: string;
    path: string;
    attributes?: Record<string, string[]>;
  }[] = [];
  const users: {
    id: string;
    email: string;
    username: string;
    firstName?: string;
    lastName?: string;
    attributes: Record<string, string[]>;
    enabled: boolean;
    emailVerified: boolean;
    requiredActions: string[];
    password?: string;
    groups: Set<string>;
  }[] = [];

  setKeycloakFetchOverride(async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init.method ?? "GET").toUpperCase();

    const json = (body: unknown, init: ResponseInit = {}) =>
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      });

    const parseRequestBody = <T>() => {
      if (typeof init.body !== "string") {
        return null as T | null;
      }
      try {
        return JSON.parse(init.body) as T;
      } catch {
        return null as T | null;
      }
    };

    if (
      url.endsWith("/realms/master/protocol/openid-connect/token") &&
      method === "POST"
    ) {
      return json({ access_token: "mock-admin-token" });
    }

    if (url === `${realmPath}` && method === "GET") {
      return json({ realm });
    }

    if (
      url.startsWith(`${realmPath}/clients`) &&
      method === "GET"
    ) {
      return json([]);
    }

    if (url.startsWith(`${realmPath}/groups`) && method === "GET") {
      const parsed = new URL(url);
      if (parsed.pathname === `${realmPathname}/groups/count`) {
        return json({ count: groups.length });
      }
      const first = Number(parsed.searchParams.get("first") ?? "0");
      const max = Number(parsed.searchParams.get("max") ?? "20");
      const start = Number.isFinite(first) ? Math.max(0, first) : 0;
      const size = Number.isFinite(max) ? Math.max(0, max) : 20;
      const includeAttributes =
        parsed.searchParams.get("briefRepresentation") === "false";
      const slice = groups.slice(start, start + size).map((group) => {
        const base = { ...group, subGroups: [] as never[] };
        if (includeAttributes) {
          return base;
        }
        const { attributes, ...withoutAttributes } = base;
        void attributes;
        return withoutAttributes;
      });
      return json(slice);
    }

    if (url === `${realmPath}/clients` && method === "POST") {
      const id = `client-${clientCounter++}`;
      return new Response(null, {
        status: 201,
        headers: { location: `${realmPath}/clients/${id}` },
      });
    }

    if (url === `${realmPath}/groups` && method === "POST") {
      const id = `group-${groupCounter++}`;
      const body = parseRequestBody<{
        name?: string;
        attributes?: Record<string, string[]>;
      }>();
      groups.push({
        id,
        name: body?.name ?? id,
        path: `${realmPath}/groups/${id}`,
        attributes: body?.attributes,
      });
      return new Response(null, {
        status: 201,
        headers: { location: `${realmPath}/groups/${id}` },
      });
    }

    if (url === `${realmPath}/users` && method === "POST") {
      const id = `user-${userCounter++}`;
      const body = parseRequestBody<{
        email?: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        attributes?: Record<string, string[]>;
        enabled?: boolean;
        emailVerified?: boolean;
        requiredActions?: string[];
      }>();
      users.push({
        id,
        email: body?.email ?? body?.username ?? `${id}@example.com`,
        username: body?.username ?? body?.email ?? id,
        firstName: body?.firstName,
        lastName: body?.lastName,
        attributes: body?.attributes ?? {},
        enabled: body?.enabled ?? true,
        emailVerified: body?.emailVerified ?? true,
        requiredActions: body?.requiredActions ?? [],
        password: undefined,
        groups: new Set<string>(),
      });
      return new Response(null, {
        status: 201,
        headers: { location: `${realmPath}/users/${id}` },
      });
    }

    if (url.endsWith("/reset-password") && method === "PUT") {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const userId = segments.at(-2);
      const body = parseRequestBody<{ value?: string }>();
      if (userId) {
        const user = users.find((candidate) => candidate.id === userId);
        if (user && body?.value) {
          user.password = body.value;
        }
      }
      return new Response(null, { status: 204 });
    }

    if (url.includes("/groups/") && method === "PUT") {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const userIndex = segments.findIndex((segment) => segment === "users");
      const groupIndex = segments.findIndex((segment) => segment === "groups");
      const userId = userIndex >= 0 ? segments[userIndex + 1] : undefined;
      const groupId = groupIndex >= 0 ? segments[groupIndex + 1] : undefined;
      if (userId && groupId) {
        const user = users.find((candidate) => candidate.id === userId);
        if (user) {
          user.groups.add(groupId);
        }
      }
      return new Response(null, { status: 204 });
    }

    if (url.startsWith(`${realmPath}/users`) && method === "GET") {
      const parsed = new URL(url);
      const path = parsed.pathname;
      const usersPathname = `${realmPathname}/users`;
      if (path === usersPathname) {
        const email = parsed.searchParams.get("email");
        const includeAttributes =
          parsed.searchParams.get("briefRepresentation") === "false";
        const matches = users.filter((user) => {
          if (!email) {
            return true;
          }
          const normalized = email.toLowerCase();
          return (
            user.email.toLowerCase() === normalized ||
            user.username.toLowerCase() === normalized
          );
        });
        const body = matches.map((user) => {
          const base = {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            enabled: user.enabled,
            emailVerified: user.emailVerified,
            requiredActions: user.requiredActions,
          };
          if (includeAttributes) {
            return { ...base, attributes: user.attributes };
          }
          return base;
        });
        return json(body);
      }

      const prefix = `${usersPathname}/`;
      if (path.startsWith(prefix)) {
        const identifier = path.slice(prefix.length).split("/")[0];
        const user = users.find((candidate) => candidate.id === identifier);
        if (!user) {
          return new Response("Not Found", { status: 404 });
        }
        return json({
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          enabled: user.enabled,
          emailVerified: user.emailVerified,
          requiredActions: user.requiredActions,
          attributes: user.attributes,
        });
      }
    }

    if (url.startsWith(`${realmPath}/users/`) && method === "PUT") {
      const parsed = new URL(url);
      const identifier = parsed.pathname
        .slice(`${realmPathname}/users/`.length)
        .split("/")[0];
      const user = users.find((candidate) => candidate.id === identifier);
      if (!user) {
        return new Response("Not Found", { status: 404 });
      }
      const body = parseRequestBody<{
        email?: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        enabled?: boolean;
        emailVerified?: boolean;
        requiredActions?: string[];
        attributes?: Record<string, string[]>;
      }>();
      if (body?.email) {
        user.email = body.email;
      }
      if (body?.username) {
        user.username = body.username;
      }
      if (body?.firstName !== undefined) {
        user.firstName = body.firstName;
      }
      if (body?.lastName !== undefined) {
        user.lastName = body.lastName;
      }
      if (body?.enabled !== undefined) {
        user.enabled = body.enabled;
      }
      if (body?.emailVerified !== undefined) {
        user.emailVerified = body.emailVerified;
      }
      if (body?.requiredActions) {
        user.requiredActions = body.requiredActions;
      }
      if (body?.attributes) {
        user.attributes = body.attributes;
      }
      return new Response(null, { status: 204 });
    }

    if (url.includes(`${realmPath}/roles/`) && method === "GET") {
      const roleName = decodeURIComponent(url.split(`${realmPath}/roles/`)[1] ?? "");
      if (createdRoles.has(roleName)) {
        return json({ id: roleName, name: roleName });
      }
      return new Response("Not Found", { status: 404 });
    }

    if (url === `${realmPath}/roles` && method === "POST") {
      let roleName: string | undefined;
      if (typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);
          if (body && typeof body.name === "string") {
            roleName = body.name;
          }
        } catch {
          // ignore malformed JSON in tests
        }
      }
      if (roleName) {
        createdRoles.add(roleName);
      }
      return new Response(null, { status: 201 });
    }

    if (url.endsWith("/role-mappings/realm") && method === "POST") {
      return new Response(null, { status: 204 });
    }

    return new Response(`Unhandled Keycloak mock: ${method} ${url}`, { status: 500 });
  });

  return () => setKeycloakFetchOverride(null);
}
