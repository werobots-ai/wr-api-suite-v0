import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import KeyRevealModal from "@/components/KeyRevealModal";
import UsageBreakdown from "@/components/UsageBreakdown";
import { fetchJSON } from "@/lib/api";
import { OrgRole, SafeApiKey, SafeKeySet, SafeUser, UsageEntry } from "@/types/account";
import { useAuth } from "@/context/AuthContext";
import {
  API_PLATFORM_PRODUCT_ID,
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  INSIGHTS_SANDBOX_PRODUCT_ID,
  ProductKeyConfig,
  cloneProductConfig,
  isApiPlatformConfig,
  isDocumentAnalysisConfig,
  isInsightsSandboxConfig,
} from "@/types/products";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Pricing = {
  questionGeneration: number;
  questionAnswering: number;
};

type MemberInfo = SafeUser & { roles: OrgRole[] };

type KeyReveal = {
  keys: string[];
  context: string;
  title?: string;
};

type NewKeySetForm = {
  name: string;
  description: string;
  products: ProductKeyConfig[];
};

const ROLE_OPTIONS: { label: string; value: OrgRole }[] = [
  { label: "Owner", value: "OWNER" },
  { label: "Admin", value: "ADMIN" },
  { label: "Billing", value: "BILLING" },
  { label: "Member", value: "MEMBER" },
];

export default function BillingPage() {
  const { organization, permissions, refreshAccount, loading, productCatalog } =
    useAuth();
  const buildInitialProducts = useCallback((): ProductKeyConfig[] => {
    const fromCatalog = productCatalog.map((product) =>
      cloneProductConfig(product.defaultConfig),
    );
    const baseList = fromCatalog.length
      ? fromCatalog
      : [
          {
            productId: DOCUMENT_ANALYSIS_PRODUCT_ID,
            permissions: { createQuestionSet: true, evaluateDocument: true },
          },
          {
            productId: INSIGHTS_SANDBOX_PRODUCT_ID,
            options: { accessLevel: "none", betaFeatures: false },
          },
          {
            productId: API_PLATFORM_PRODUCT_ID,
            options: { environment: "sandbox", allowModelTraining: false },
          },
        ];

    return baseList.map((config) => {
      if (isDocumentAnalysisConfig(config)) {
        return {
          ...config,
          permissions: {
            ...config.permissions,
            createQuestionSet: true,
            evaluateDocument: true,
          },
        };
      }
      return cloneProductConfig(config);
    });
  }, [productCatalog]);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [newSet, setNewSet] = useState<NewKeySetForm>(() => ({
    name: "",
    description: "",
    products: buildInitialProducts(),
  }));
  const [revealModal, setRevealModal] = useState<KeyReveal | null>(null);
  const [pendingRotation, setPendingRotation] = useState<{
    setId: string;
    setName: string;
    index: number;
  } | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [memberForm, setMemberForm] = useState({
    email: "",
    name: "",
    roles: ["MEMBER"] as OrgRole[],
    password: "",
  });
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  useEffect(() => {
    setNewSet((current) => {
      const baseline = buildInitialProducts();
      const merged = baseline.map((config) => {
        const existing = current.products.find(
          (p) => p.productId === config.productId,
        );
        return cloneProductConfig(existing ?? config);
      });
      return { ...current, products: merged };
    });
  }, [buildInitialProducts]);

  const updateProductConfig = useCallback(
    (
      productId: string,
      updater: (config: ProductKeyConfig) => ProductKeyConfig,
    ) => {
      setNewSet((current) => {
        const baseline = buildInitialProducts();
        const merged = baseline.map((config) => {
          const existing = current.products.find(
            (p) => p.productId === config.productId,
          );
          const source = existing ?? config;
          const next = source.productId === productId ? updater(source) : source;
          return cloneProductConfig(next);
        });
        return { ...current, products: merged };
      });
    },
    [buildInitialProducts],
  );

  const canManageKeys = Boolean(permissions?.manageKeys);
  const canManageBilling = Boolean(permissions?.manageBilling);
  const canManageUsers = Boolean(permissions?.manageUsers);
  const canViewMembers = canManageUsers || canManageBilling;
  const canViewInternalCosts = Boolean(permissions?.viewInternalCosts);
  const resolveProductName = (productId: string) =>
    productCatalog.find((product) => product.id === productId)?.name || productId;
  const documentProductConfig = newSet.products.find(
    (product) => product.productId === DOCUMENT_ANALYSIS_PRODUCT_ID,
  );
  const insightsProductConfig = newSet.products.find(
    (product) => product.productId === INSIGHTS_SANDBOX_PRODUCT_ID,
  );
  const apiProductConfig = newSet.products.find(
    (product) => product.productId === API_PLATFORM_PRODUCT_ID,
  );
  const renderProductSummary = (product: ProductKeyConfig) => {
    if (isDocumentAnalysisConfig(product)) {
      const grants = [] as string[];
      if (product.permissions.createQuestionSet) {
        grants.push("create question sets");
      }
      if (product.permissions.evaluateDocument) {
        grants.push("evaluate documents");
      }
      return grants.length ? grants.join(", ") : "no permissions";
    }
    if (isInsightsSandboxConfig(product)) {
      const grants = [`access: ${product.options.accessLevel}`];
      if (product.options.betaFeatures) {
        grants.push("beta features");
      }
      return grants.join(", ");
    }
    if (isApiPlatformConfig(product)) {
      const grants = [`env: ${product.options.environment}`];
      if (product.options.allowModelTraining) {
        grants.push("model training");
      }
      return grants.join(", ");
    }
    return "configured";
  };

  useEffect(() => {
    fetch(`${API_URL}/api/pricing`)
      .then((res) => res.json())
      .then(setPricing)
      .catch(() => setPricing(null));
  }, []);

  const loadMembers = useCallback(async () => {
    if (!canViewMembers) return;
    setMemberError(null);
    try {
      const response = await fetchJSON<{ members: MemberInfo[] }>(
        `${API_URL}/api/account/users`,
      );
      setMembers(response.members);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMemberError(message || "Failed to load members");
    }
  }, [canViewMembers]);

  useEffect(() => {
    if (!organization) return;
    void loadMembers();
  }, [organization, loadMembers]);

  useEffect(() => {
    if (!organization && !loading) {
      void refreshAccount();
    }
  }, [organization, loading, refreshAccount]);

  const handleTopUp = async () => {
    if (!canManageBilling || amount <= 0) return;
    await fetchJSON(`${API_URL}/api/account/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    setAmount(0);
    setRevealModal(null);
    await refreshAccount();
  };

  const rotateKey = async (setId: string, setName: string, index: number) => {
    if (!canManageKeys) return;
    const result = await fetchJSON<{
      apiKey: string;
      key: SafeApiKey;
    }>(`${API_URL}/api/account/keysets/${setId}/keys/${index}/rotate`, {
      method: "POST",
    });
    setRevealModal({
      keys: [result.apiKey],
      context: `API key for "${setName}" rotated. The previous key is now inactive. Save this value in your secrets manager before closing this dialog.`,
      title: "API key rotated",
    });
    await refreshAccount();
  };

  const requestRotate = (setId: string, setName: string, index: number) => {
    if (!canManageKeys) return;
    setPendingRotation({ setId, setName, index });
  };

  const confirmRotate = async () => {
    if (!pendingRotation) return;
    const { setId, setName, index } = pendingRotation;
    try {
      await rotateKey(setId, setName, index);
    } finally {
      setPendingRotation(null);
    }
  };

  const cancelRotate = () => {
    setPendingRotation(null);
  };

  const handleAddKeySet = async () => {
    if (!canManageKeys || !newSet.name) return;
    const result = await fetchJSON<{
      keySet: SafeKeySet;
      revealedKeys: string[];
    }>(`${API_URL}/api/account/keysets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSet),
    });
    setNewSet({
      name: "",
      description: "",
      products: buildInitialProducts(),
    });
    setRevealModal({
      keys: result.revealedKeys,
      context: `Key set "${result.keySet.name}" created. Share these values only with trusted clients and store them securely.`,
      title: "New API keys issued",
    });
    await refreshAccount();
  };

  const handleRemoveKeySet = async (id: string) => {
    if (!canManageKeys) return;
    await fetchJSON(`${API_URL}/api/account/keysets/${id}`, { method: "DELETE" });
    await refreshAccount();
  };

  const toggleRole = (role: OrgRole) => {
    setMemberForm((current) => {
      const hasRole = current.roles.includes(role);
      const roles = hasRole
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role];
      return { ...current, roles };
    });
  };

  const handleCreateMember = async () => {
    if (!canManageUsers) return;
    if (!memberForm.email || !memberForm.name) {
      setMemberError("Name and email are required");
      return;
    }
    if (!memberForm.roles.length) {
      setMemberError("Select at least one role");
      return;
    }
    setMemberError(null);
    setMemberMessage(null);
    const response = await fetchJSON<{
      user: MemberInfo;
      generatedPassword?: string;
      isNewUser: boolean;
    }>(`${API_URL}/api/account/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: memberForm.email,
        name: memberForm.name,
        roles: memberForm.roles,
        password: memberForm.password || undefined,
      }),
    });
    setMemberForm({ email: "", name: "", roles: ["MEMBER"], password: "" });
    await loadMembers();
    if (response.generatedPassword) {
      setMemberMessage(
        `Generated password for ${response.user.email}: ${response.generatedPassword}. Share securely with the user.`,
      );
    } else {
      setMemberMessage("User saved. They can now access the organization.");
    }
  };

  const organizationUsage = useMemo<UsageEntry[]>(
    () => organization?.usage ?? [],
    [organization?.usage],
  );

  const orgStats = useMemo(
    () => {
      if (!organization) {
        return { keySets: 0, apiKeys: 0, members: 0 };
      }
      const apiKeys = organization.keySets.reduce(
        (total, set) => total + set.keys.length,
        0,
      );
      const members = organization.members.filter((member) => member.status === "active").length;
      return {
        keySets: organization.keySets.length,
        apiKeys,
        members,
      };
    },
    [organization],
  );

  const usageSummary = useMemo(
    () =>
      organizationUsage.reduce(
        (acc, entry) => {
          acc.billed += entry.billedCost;
          acc.token += entry.tokenCost ?? 0;
          acc.requests += entry.requests;
          return acc;
        },
        { billed: 0, token: 0, requests: 0 },
      ),
    [organizationUsage],
  );

  const sectionItems = useMemo(
    () =>
      [
        { id: "section-overview", label: "Overview" },
        pricing
          ? { id: "section-pricing", label: "Pricing" }
          : null,
        { id: "section-credits", label: "Credits & top-ups" },
        { id: "section-keys", label: "API access" },
        { id: "section-usage", label: "Usage history" },
        canViewMembers
          ? { id: "section-members", label: "Members" }
          : null,
      ].filter(
        (item): item is { id: string; label: string } => item !== null,
      ),
    [pricing, canViewMembers],
  );

  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionItems.length) return;
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const fallback = sectionItems[0]?.id ?? null;
    if (!activeSection && fallback) {
      setActiveSection(fallback);
    } else if (
      activeSection &&
      !sectionItems.some((section) => section.id === activeSection) &&
      fallback &&
      activeSection !== fallback
    ) {
      setActiveSection(fallback);
    }
    const order = new Map(sectionItems.map((section, index) => [section.id, index] as const));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => (order.get(a.target.id) ?? 0) - (order.get(b.target.id) ?? 0),
          );
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: 0.2 },
    );
    sectionItems.forEach((section) => {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [sectionItems, activeSection]);

  const handleNavClick = (id: string) => {
    const node = document.getElementById(id);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveSection(id);
  };

  if (loading && !organization) {
    return <div className="container">Loading...</div>;
  }

  if (!organization) {
    return (
      <div className="container">
        <div className="card">
          <h1>Account &amp; Billing</h1>
          <p>Please sign in to manage billing and API access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <ConfirmModal
        isOpen={Boolean(pendingRotation)}
        title="Rotate API key?"
        confirmLabel="Rotate key"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmRotate}
        onCancel={cancelRotate}
      >
        {pendingRotation && (
          <>
            <p>
              Rotating the key for <strong>{pendingRotation.setName}</strong> will immediately expire the
              existing secret.
            </p>
            <p>This action cannot be undone. Update all integrations with the new value right away.</p>
          </>
        )}
      </ConfirmModal>
      <KeyRevealModal
        isOpen={Boolean(revealModal)}
        keys={revealModal?.keys ?? []}
        context={revealModal?.context ?? ""}
        title={revealModal?.title ?? "Secrets generated"}
        onClose={() => setRevealModal(null)}
      />
      <div className="layout">
        <aside className="section-nav">
          <h2>Account index</h2>
          <ul>
            {sectionItems.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={section.id === activeSection ? "active" : ""}
                  onClick={() => handleNavClick(section.id)}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="content">
          <section id="section-overview" className="card hero">
            <h1>{organization.name}</h1>
            <p>
              Manage billing, API credentials, and team access for your organization.
            </p>
            <div className="stat-grid">
              <div className="stat">
                <span className="label">Available credits</span>
                <span className="value">${organization.credits.toFixed(2)}</span>
              </div>
              <div className="stat">
                <span className="label">API key sets</span>
                <span className="value">{orgStats.keySets}</span>
              </div>
              <div className="stat">
                <span className="label">Active API keys</span>
                <span className="value">{orgStats.apiKeys}</span>
              </div>
              <div className="stat">
                <span className="label">Active members</span>
                <span className="value">{orgStats.members}</span>
              </div>
            </div>
          </section>

          {pricing && (
            <section id="section-pricing" className="card">
              <h2>Pricing</h2>
              <p>
                Question generation: ${pricing.questionGeneration.toFixed(2)} per request
              </p>
              <p>
                Question answering: ${pricing.questionAnswering.toFixed(2)} per request
              </p>
              <p className="hint">
                These figures mirror our live pricing tables. Stripe billing will be wired here soon.
              </p>
            </section>
          )}

          <section id="section-credits" className="card">
            <h2>Credits &amp; top-ups</h2>
            <p className="metric">${organization.credits.toFixed(2)}</p>
            {canManageBilling ? (
              <div className="topup">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setAmount(Number.isNaN(value) ? 0 : value);
                  }}
                  placeholder="Amount"
                  min={0}
                />
                <button onClick={handleTopUp} disabled={amount <= 0}>
                  Top Up
                </button>
              </div>
            ) : (
              <p className="hint">Contact your organization owner or billing admin to add funds.</p>
            )}
          </section>

          <section id="section-keys" className="card">
            <h2>API access</h2>
            <p className="hint">
              Rotate keys routinely and revoke them immediately if they are suspected to be compromised.
            </p>
            {organization.keySets.map((set) => (
              <div key={set.id} className="keyset">
                <div className="keyset-header">
                  <div>
                    <h3>{set.name}</h3>
                    <p className="meta">Created {new Date(set.createdAt).toLocaleString()}</p>
                  </div>
                  {canManageKeys && (
                    <button onClick={() => handleRemoveKeySet(set.id)}>Remove</button>
                  )}
                </div>
                <p>{set.description}</p>
                <div className="product-summary">
                  <h4>Product access</h4>
                  <ul>
                    {set.products.map((product) => (
                      <li key={product.productId}>
                        <strong>{resolveProductName(product.productId)}:</strong>{" "}
                        {renderProductSummary(product)}
                      </li>
                    ))}
                  </ul>
                </div>
                <ul>
                  {set.keys.map((k, idx) => {
                    const total = k.usage.reduce((a, b) => a + b.billedCost, 0);
                    const reqs = k.usage.reduce((a, b) => a + b.requests, 0);
                    const spend = k.usage.reduce((a, b) => a + (b.tokenCost ?? 0), 0);
                    const rotatedDate = new Date(k.lastRotated);
                    const lastAccessedDate = k.lastAccessed ? new Date(k.lastAccessed) : null;
                    const lastAccessedLabel = lastAccessedDate
                      ? lastAccessedDate.toLocaleString()
                      : null;
                    return (
                      <li key={k.id}>
                        <div className="key-info">
                          <code>{k.maskedKey}</code>
                          <div className="key-meta">
                            <span
                              className="meta"
                              title={rotatedDate.toISOString()}
                            >
                              Rotated {rotatedDate.toLocaleString()}
                            </span>
                            <span
                              className="meta"
                              title={lastAccessedDate ? lastAccessedDate.toISOString() : undefined}
                            >
                              {lastAccessedLabel ? `Last used ${lastAccessedLabel}` : "Never used"}
                            </span>
                          </div>
                        </div>
                        <div className="key-actions">
                          {canManageKeys && (
                            <button onClick={() => requestRotate(set.id, set.name, idx)}>
                              Rotate
                            </button>
                          )}
                          <span className="usage">
                            <span>{reqs} reqs</span>
                            <span title={`$${total}`}>billed ${total.toFixed(2)}</span>
                            {canViewInternalCosts && (
                              <span title={`$${spend}`}>OpenAI ${spend.toFixed(4)}</span>
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {organization.keySets.length === 0 && (
              <p className="hint">No key sets have been created yet.</p>
            )}
            {canManageKeys && (
              <div className="add-set">
                <input
                  type="text"
                  placeholder="Name"
                  value={newSet.name}
                  onChange={(e) => setNewSet({ ...newSet, name: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={newSet.description}
                  onChange={(e) => setNewSet({ ...newSet, description: e.target.value })}
                />
                {documentProductConfig &&
                  isDocumentAnalysisConfig(documentProductConfig) && (
                    <fieldset className="product-fieldset">
                      <legend>
                        {resolveProductName(DOCUMENT_ANALYSIS_PRODUCT_ID)}
                      </legend>
                      <label>
                        <input
                          type="checkbox"
                          checked={documentProductConfig.permissions.createQuestionSet}
                          onChange={(e) =>
                            updateProductConfig(
                              DOCUMENT_ANALYSIS_PRODUCT_ID,
                              (config) => {
                                if (!isDocumentAnalysisConfig(config)) return config;
                                return {
                                  ...config,
                                  permissions: {
                                    ...config.permissions,
                                    createQuestionSet: e.target.checked,
                                  },
                                };
                              },
                            )
                          }
                        />
                        Allow question set creation
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={documentProductConfig.permissions.evaluateDocument}
                          onChange={(e) =>
                            updateProductConfig(
                              DOCUMENT_ANALYSIS_PRODUCT_ID,
                              (config) => {
                                if (!isDocumentAnalysisConfig(config)) return config;
                                return {
                                  ...config,
                                  permissions: {
                                    ...config.permissions,
                                    evaluateDocument: e.target.checked,
                                  },
                                };
                              },
                            )
                          }
                        />
                        Allow document evaluation
                      </label>
                    </fieldset>
                  )}
                {insightsProductConfig &&
                  isInsightsSandboxConfig(insightsProductConfig) && (
                    <fieldset className="product-fieldset">
                      <legend>
                        {resolveProductName(INSIGHTS_SANDBOX_PRODUCT_ID)}
                      </legend>
                      <label>
                        Access level
                        <select
                          value={insightsProductConfig.options.accessLevel}
                          onChange={(e) =>
                            updateProductConfig(
                              INSIGHTS_SANDBOX_PRODUCT_ID,
                              (config) => {
                                if (!isInsightsSandboxConfig(config)) return config;
                                return {
                                  ...config,
                                  options: {
                                    ...config.options,
                                    accessLevel: e.target.value as
                                      | "none"
                                      | "read"
                                      | "write",
                                  },
                                };
                              },
                            )
                          }
                        >
                          <option value="none">No access</option>
                          <option value="read">Read-only</option>
                          <option value="write">Full access</option>
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={insightsProductConfig.options.betaFeatures}
                          onChange={(e) =>
                            updateProductConfig(
                              INSIGHTS_SANDBOX_PRODUCT_ID,
                              (config) => {
                                if (!isInsightsSandboxConfig(config)) return config;
                                return {
                                  ...config,
                                  options: {
                                    ...config.options,
                                    betaFeatures: e.target.checked,
                                  },
                                };
                              },
                            )
                          }
                        />
                        Enable beta features
                      </label>
                    </fieldset>
                  )}
                {apiProductConfig && isApiPlatformConfig(apiProductConfig) && (
                  <fieldset className="product-fieldset">
                    <legend>{resolveProductName(API_PLATFORM_PRODUCT_ID)}</legend>
                    <label>
                      Environment
                      <select
                        value={apiProductConfig.options.environment}
                        onChange={(e) =>
                          updateProductConfig(API_PLATFORM_PRODUCT_ID, (config) => {
                            if (!isApiPlatformConfig(config)) return config;
                            return {
                              ...config,
                              options: {
                                ...config.options,
                                environment: e.target.value as
                                  | "sandbox"
                                  | "production",
                              },
                            };
                          })
                        }
                      >
                        <option value="sandbox">Sandbox</option>
                        <option value="production">Production</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={apiProductConfig.options.allowModelTraining}
                        onChange={(e) =>
                          updateProductConfig(API_PLATFORM_PRODUCT_ID, (config) => {
                            if (!isApiPlatformConfig(config)) return config;
                            return {
                              ...config,
                              options: {
                                ...config.options,
                                allowModelTraining: e.target.checked,
                              },
                            };
                          })
                        }
                      />
                      Allow model training
                    </label>
                  </fieldset>
                )}
                <button onClick={handleAddKeySet} disabled={!newSet.name}>
                  Add Key Set
                </button>
              </div>
            )}
          </section>

          <section id="section-usage" className="card">
            <h2>Usage</h2>
            <p className="hint">
              {usageSummary.requests} requests billed ${usageSummary.billed.toFixed(2)}
              {canViewInternalCosts ? (
                <>
                  {" "}with an OpenAI cost of
                  {" "}
                  <span title={`$${usageSummary.token}`}>
                    ${usageSummary.token.toFixed(4)}
                  </span>
                  .
                </>
              ) : (
                "."
              )}
            </p>
            <UsageBreakdown
              entries={organizationUsage}
              showCostColumns={canViewInternalCosts}
            />
          </section>

          {canViewMembers && (
            <section id="section-members" className="card">
              <h2>Organization members</h2>
              {memberMessage && <div className="notice success">{memberMessage}</div>}
              {memberError && <div className="notice error">{memberError}</div>}
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td>{member.email}</td>
                      <td>{member.roles.join(", ")}</td>
                      <td>
                        {member.lastLoginAt
                          ? new Date(member.lastLoginAt).toLocaleString()
                          : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canManageUsers && (
                <div className="member-form">
                  <h3>Add or update member</h3>
                  <div className="form-grid">
                    <label>
                      Name
                      <input
                        type="text"
                        value={memberForm.name}
                        onChange={(e) =>
                          setMemberForm({ ...memberForm, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        value={memberForm.email}
                        onChange={(e) =>
                          setMemberForm({ ...memberForm, email: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Temporary password (optional)
                      <input
                        type="text"
                        value={memberForm.password}
                        onChange={(e) =>
                          setMemberForm({ ...memberForm, password: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <fieldset>
                    <legend>Roles</legend>
                    <div className="role-grid">
                      {ROLE_OPTIONS.map((role) => (
                        <label key={role.value}>
                          <input
                            type="checkbox"
                            checked={memberForm.roles.includes(role.value)}
                            onChange={() => toggleRole(role.value)}
                          />
                          {role.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button onClick={handleCreateMember}>Save member</button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      <style jsx>{`
        .container {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          background: #f0f2f5;
          padding: 1.5rem;
          gap: 1rem;
          overflow-y: auto;
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(220px, 260px) 1fr;
          gap: 1.5rem;
          align-items: start;
        }
        .section-nav {
          position: sticky;
          top: 1.5rem;
          align-self: flex-start;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .section-nav h2 {
          margin: 0;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #666;
        }
        .section-nav ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .section-nav li {
          margin: 0;
        }
        .section-nav button {
          width: 100%;
          text-align: left;
          padding: 0.35rem 0.75rem 0.35rem 1rem;
          border: none;
          border-radius: 0;
          background: transparent;
          color: #434343;
          font-weight: 500;
          cursor: pointer;
          position: relative;
          transition: color 0.2s ease;
        }
        .section-nav button::before {
          content: "";
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 1rem;
          border-radius: 999px;
          background: transparent;
          transition: background 0.2s ease, height 0.2s ease;
        }
        .section-nav button:hover {
          color: #d48806;
        }
        .section-nav button:focus-visible {
          outline: none;
          color: #d48806;
        }
        .section-nav button.active {
          color: #262626;
          font-weight: 600;
        }
        .section-nav button.active::before {
          background: #d48806;
          height: 70%;
        }
        .content {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .card {
          background: #fff;
          padding: 1.25rem;
          border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          scroll-margin-top: 96px;
        }
        .card h2 {
          margin: 0;
        }
        .hero h1 {
          margin: 0;
          font-size: 1.75rem;
        }
        .hero p {
          margin: 0;
          color: #555;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.75rem;
        }
        .stat {
          background: #fafafa;
          border: 1px solid #f0f0f0;
          border-radius: 6px;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .stat .label {
          font-size: 0.75rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat .value {
          font-size: 1.35rem;
          font-weight: 600;
        }
        .metric {
          font-size: 2rem;
          font-weight: 600;
          margin: 0;
        }
        .hint {
          margin: 0;
          font-size: 0.9rem;
          color: #666;
        }
        .topup {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .topup input {
          padding: 0.5rem;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
        }
        .topup button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          background: #1890ff;
          color: #fff;
          cursor: pointer;
        }
        .topup button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .keyset {
          border-top: 1px solid #eee;
          padding-top: 0.5rem;
          margin-top: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .keyset-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }
        .keyset-header button {
          padding: 0.35rem 0.75rem;
          border: 1px solid #ff4d4f;
          border-radius: 4px;
          background: #fff1f0;
          color: #cf1322;
          cursor: pointer;
        }
        .keyset-header button:hover {
          background: #ffa39e;
          color: #a8071a;
        }
        .key-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .key-info code {
          background: #f6f6f6;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }
        .key-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: #777;
        }
        .key-meta .meta {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          padding: 0.35rem 0;
          flex-wrap: wrap;
        }
        .key-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }
        .key-actions button {
          padding: 0.25rem 0.6rem;
          border: none;
          border-radius: 4px;
          background: #1890ff;
          color: #fff;
          cursor: pointer;
        }
        .key-actions button:hover {
          background: #096dd9;
        }
        .key-actions .usage {
          font-size: 0.85rem;
          color: #555;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .key-actions .usage span + span::before {
          content: "·";
          color: #bfbfbf;
          margin: 0 0.25rem;
        }
        .add-set {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.75rem;
        }
        .add-set input {
          padding: 0.5rem;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
        }
        .add-set button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          background: #1890ff;
          color: #fff;
          cursor: pointer;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th,
        td {
          text-align: left;
          padding: 0.5rem;
          border-bottom: 1px solid #f0f0f0;
        }
        .member-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          border-top: 1px solid #eee;
          padding-top: 1rem;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
        }
        .form-grid label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-weight: 500;
        }
        .form-grid input {
          padding: 0.5rem;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
        }
        fieldset {
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          padding: 0.75rem;
        }
        legend {
          padding: 0 0.5rem;
          font-weight: 600;
        }
        .role-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.5rem;
        }
        .notice {
          padding: 0.75rem;
          border-radius: 4px;
        }
        .notice.success {
          background: #f6ffed;
          border: 1px solid #b7eb8f;
        }
        .notice.error {
          background: #fff2f0;
          border: 1px solid #ffccc7;
        }
        @media (max-width: 960px) {
          .layout {
            grid-template-columns: 1fr;
          }
          .section-nav {
            position: static;
          }
          .section-nav ul {
            flex-direction: row;
            flex-wrap: wrap;
          }
          .section-nav button {
            flex: 1 1 auto;
            padding-left: 0.75rem;
          }
          .section-nav button::before {
            top: auto;
            bottom: -0.15rem;
            transform: none;
            width: 100%;
            height: 2px;
          }
        }
        @media (max-width: 640px) {
          .topup {
            flex-direction: column;
            align-items: stretch;
          }
          .topup button {
            width: 100%;
          }
          .key-actions {
            align-items: flex-start;
          }
          .key-actions button {
            width: 100%;
          }
          .section-nav button {
            font-size: 0.9rem;
          }
        }
      `}</style>
    </div>
  );
}
