import { setKeycloakFetchOverride } from "../../src/shared/utils/keycloak/http";

export function installMockKeycloak(): () => void {
  const baseUrl = "http://localhost:8080";
  const realm = "werobots-local";
  const realmPath = `${baseUrl}/admin/realms/${realm}`;
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
      if (parsed.pathname === `${realmPath}/groups/count`) {
        return json({ count: groups.length });
      }
      const first = Number(parsed.searchParams.get("first") ?? "0");
      const max = Number(parsed.searchParams.get("max") ?? "20");
      const start = Number.isFinite(first) ? Math.max(0, first) : 0;
      const size = Number.isFinite(max) ? Math.max(0, max) : 20;
      const slice = groups.slice(start, start + size).map((group) => ({
        ...group,
        subGroups: [],
      }));
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
      return new Response(null, {
        status: 201,
        headers: { location: `${realmPath}/users/${id}` },
      });
    }

    if (url.endsWith("/reset-password") && method === "PUT") {
      return new Response(null, { status: 204 });
    }

    if (url.includes("/groups/") && method === "PUT") {
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
