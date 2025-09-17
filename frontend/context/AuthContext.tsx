import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  AccountPermissions,
  ProductCatalogResponse,
  SafeOrganization,
  SafeUser,
} from "@/types/account";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface AuthContextValue {
  token: string | null;
  user: SafeUser | null;
  organization: SafeOrganization | null;
  organizations: SafeOrganization[];
  permissions: AccountPermissions | null;
  activeOrgId: string | null;
  loading: boolean;
  productCatalog: ProductCatalogResponse;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: {
    organizationName: string;
    ownerEmail: string;
    ownerName: string;
    ownerPassword: string;
    billingEmail?: string;
  }) => Promise<{ revealedApiKeys: string[] }>;
  bootstrapMaster: (input: {
    organizationName: string;
    ownerEmail: string;
    ownerName: string;
    ownerPassword: string;
    billingEmail?: string;
  }) => Promise<{ revealedApiKeys: string[]; bootstrapCompletedAt: string | null }>;
  logout: () => void;
  refreshAccount: () => Promise<void>;
  setActiveOrg: (orgId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function setStoredValue(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [organization, setOrganization] = useState<SafeOrganization | null>(null);
  const [organizations, setOrganizations] = useState<SafeOrganization[]>([]);
  const [permissions, setPermissions] = useState<AccountPermissions | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [productCatalog, setProductCatalog] = useState<ProductCatalogResponse>([]);
  const [loading, setLoading] = useState(true);

  const fetchWithAuth = useCallback(
    async (
      path: string,
      opts: RequestInit = {},
      orgId?: string | null,
      customToken?: string | null,
    ) => {
      const activeToken = customToken ?? token;
      if (!activeToken) {
        throw new Error("No active session");
      }
      const headers = new Headers(opts.headers || {});
      headers.set("Authorization", `Bearer ${activeToken}`);
      const targetOrg = orgId ?? activeOrgId;
      if (targetOrg) {
        headers.set("x-org-id", targetOrg);
      }
      const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
    [token, activeOrgId],
  );

  const refreshAccountInternal = useCallback(
    async (customToken?: string | null, orgId?: string) => {
      const activeToken = customToken ?? token;
      if (!activeToken) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const accountData = await fetchWithAuth(
          "/api/account",
          {},
          orgId ?? activeOrgId,
          activeToken,
        );
        setUser(accountData.user);
        setOrganization(accountData.organization);
        setPermissions(accountData.permissions);
        setProductCatalog(accountData.productCatalog ?? []);
        const resolvedOrgId =
          orgId ?? activeOrgId ?? accountData.organization?.id ?? null;
        if (resolvedOrgId) {
          setActiveOrgId(resolvedOrgId);
          setStoredValue("wr_active_org", resolvedOrgId);
        }
        const orgList = await fetchWithAuth(
          "/api/account/organizations",
          {},
          resolvedOrgId,
          activeToken,
        );
        setOrganizations(orgList.organizations || []);
      } catch (err) {
        console.error("Failed to refresh account", err);
      } finally {
        setLoading(false);
      }
    },
    [token, activeOrgId, fetchWithAuth],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setOrganization(null);
    setOrganizations([]);
    setPermissions(null);
    setActiveOrgId(null);
    setStoredValue("wr_auth_token", null);
    setStoredValue("wr_active_org", null);
    setProductCatalog([]);
  }, []);

  useEffect(() => {
    const storedToken = getStoredValue("wr_auth_token");
    const storedOrg = getStoredValue("wr_active_org");
    if (storedToken) {
      setToken(storedToken);
      setActiveOrgId(storedOrg);
      refreshAccountInternal(storedToken, storedOrg ?? undefined).catch(() => {
        logout();
      });
    } else {
      setLoading(false);
    }
  }, [refreshAccountInternal, logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_URL}/api/auth/dev/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setToken(data.token);
      setStoredValue("wr_auth_token", data.token);
      const firstOrg = data.organizations?.[0]?.id ?? null;
      if (firstOrg) {
        setActiveOrgId(firstOrg);
        setStoredValue("wr_active_org", firstOrg);
      }
      setOrganizations(data.organizations || []);
      await refreshAccountInternal(data.token, firstOrg ?? undefined);
    },
    [refreshAccountInternal],
  );

  const signup = useCallback(
    async (input: {
      organizationName: string;
      ownerEmail: string;
      ownerName: string;
      ownerPassword: string;
      billingEmail?: string;
    }): Promise<{ revealedApiKeys: string[] }> => {
      const res = await fetch(`${API_URL}/api/auth/dev/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setToken(data.token);
      setStoredValue("wr_auth_token", data.token);
      setActiveOrgId(data.organization.id);
      setStoredValue("wr_active_org", data.organization.id);
      setOrganizations([data.organization]);
      await refreshAccountInternal(data.token, data.organization.id);
      return { revealedApiKeys: data.revealedApiKeys || [] };
    },
    [refreshAccountInternal],
  );

  const bootstrapMaster = useCallback(
    async (input: {
      organizationName: string;
      ownerEmail: string;
      ownerName: string;
      ownerPassword: string;
      billingEmail?: string;
    }): Promise<{ revealedApiKeys: string[]; bootstrapCompletedAt: string | null }> => {
      const res = await fetch(`${API_URL}/api/auth/dev/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setToken(data.token);
      setStoredValue("wr_auth_token", data.token);
      setActiveOrgId(data.organization.id);
      setStoredValue("wr_active_org", data.organization.id);
      setOrganizations([data.organization]);
      await refreshAccountInternal(data.token, data.organization.id);
      return {
        revealedApiKeys: data.revealedApiKeys || [],
        bootstrapCompletedAt: data.bootstrapCompletedAt ?? null,
      };
    },
    [refreshAccountInternal],
  );

  const setActiveOrg = useCallback(
    async (orgId: string) => {
      setActiveOrgId(orgId);
      setStoredValue("wr_active_org", orgId);
      await refreshAccountInternal(token, orgId);
    },
    [refreshAccountInternal, token],
  );

  const triggerRefresh = useCallback(() => refreshAccountInternal(), [refreshAccountInternal]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      organization,
      organizations,
      permissions,
      activeOrgId,
      loading,
      productCatalog,
      login,
      signup,
      bootstrapMaster,
      logout,
      refreshAccount: triggerRefresh,
      setActiveOrg,
    }),
    [
      token,
      user,
      organization,
      organizations,
      permissions,
      activeOrgId,
      loading,
      productCatalog,
      login,
      signup,
      bootstrapMaster,
      logout,
      triggerRefresh,
      setActiveOrg,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
