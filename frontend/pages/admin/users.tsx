import { useCallback, useEffect, useMemo, useState } from "react";
import UsageBreakdown from "@/components/UsageBreakdown";
import KeyRevealModal from "@/components/KeyRevealModal";
import { fetchJSON } from "@/lib/api";
import { splitUsageEntries, summarizeTopUps } from "@/lib/usage";
import {
  PlatformOrganization,
  PlatformOverview,
  SafeApiKey,
} from "@/types/account";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type RotateResponse = {
  apiKey: string;
  key: SafeApiKey;
};

function formatCurrency(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`;
}

export default function AdminConsole() {
  const { user, loading } = useAuth();
  const hasPlatformAccess = Boolean(
    user?.globalRoles.some((role) => role === "SYSADMIN" || role === "MASTER_ADMIN"),
  );

  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [keyModal, setKeyModal] = useState<{ keys: string[]; context: string; title: string } | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "master" | "tenant">("all");
  const [masterUpdateMessage, setMasterUpdateMessage] = useState<string | null>(null);
  const [masterUpdateError, setMasterUpdateError] = useState<string | null>(null);
  const [updatingMaster, setUpdatingMaster] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      const data = await fetchJSON<PlatformOverview>(`${API_URL}/api/admin/overview`);
      setOverview(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load platform overview");
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPlatformAccess) return;
    void loadOverview();
  }, [hasPlatformAccess, loadOverview]);

  const filteredOrganizations = useMemo(() => {
    if (!overview) return [] as PlatformOrganization[];
    const term = search.trim().toLowerCase();
    return overview.organizations.filter((entry) => {
      const matchesSearch =
        term.length === 0 ||
        [entry.organization.name, entry.organization.slug]
          .join(" ")
          .toLowerCase()
          .includes(term);
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "master"
          ? entry.organization.isMaster
          : !entry.organization.isMaster;
      return matchesSearch && matchesFilter;
    });
  }, [overview, search, filter]);

  useEffect(() => {
    if (!overview) {
      setSelectedOrgId(null);
      return;
    }
    if (filteredOrganizations.length === 0) {
      setSelectedOrgId(null);
      return;
    }
    if (
      !selectedOrgId ||
      !filteredOrganizations.some(
        (entry) => entry.organization.id === selectedOrgId,
      )
    ) {
      setSelectedOrgId(filteredOrganizations[0].organization.id);
    }
  }, [overview, filteredOrganizations, selectedOrgId]);

  useEffect(() => {
    setMasterUpdateMessage(null);
    setMasterUpdateError(null);
  }, [selectedOrgId]);

  const selectedOrganization = useMemo(() => {
    if (!selectedOrgId) return null;
    const inFiltered = filteredOrganizations.find(
      (entry) => entry.organization.id === selectedOrgId,
    );
    if (inFiltered) return inFiltered;
    if (!overview) return null;
    return (
      overview.organizations.find((entry) => entry.organization.id === selectedOrgId) || null
    );
  }, [filteredOrganizations, overview, selectedOrgId]);

  const profitMargin = useMemo(() => {
    if (!overview || overview.totals.totalBilled === 0) return 0;
    return (overview.totals.netRevenue / overview.totals.totalBilled) * 100;
  }, [overview]);

  const selectedMetrics = useMemo(() => {
    if (!selectedOrganization) {
      return {
        billed: 0,
        tokenCost: 0,
        net: 0,
        topUps: 0,
        credits: 0,
        requests: 0,
        members: 0,
        keys: 0,
        lastTopUpAt: null as string | null,
      };
    }
    return {
      billed: selectedOrganization.usage.totalBilled,
      tokenCost: selectedOrganization.usage.totalTokenCost,
      net: selectedOrganization.usage.netRevenue,
      topUps: selectedOrganization.topUps.totalTopUps,
      credits: selectedOrganization.organization.credits,
      requests: selectedOrganization.usage.totalRequests,
      members: selectedOrganization.activeMemberCount,
      keys: selectedOrganization.apiKeyCount,
      lastTopUpAt: selectedOrganization.topUps.lastTopUpAt,
    };
  }, [selectedOrganization]);

  const { usage: selectedOrgUsageEntries, topUps: selectedOrgTopUps } = useMemo(
    () => splitUsageEntries(selectedOrganization?.organization.usage ?? []),
    [selectedOrganization?.organization.usage],
  );

  const selectedOrgTopUpSummary = useMemo(
    () => summarizeTopUps(selectedOrgTopUps),
    [selectedOrgTopUps],
  );

  const rotateKey = useCallback(
    async (org: PlatformOrganization, setId: string, index: number) => {
      const result = await fetchJSON<RotateResponse>(
        `${API_URL}/api/admin/organizations/${org.organization.id}/keysets/${setId}/keys/${index}/rotate`,
        { method: "POST" },
      );
      setKeyModal({
        keys: [result.apiKey],
        context: `Rotated key for ${org.organization.name}. The previous secret is now invalid.`,
        title: "API key rotated",
      });
      await loadOverview();
    },
    [loadOverview],
  );

  const toggleMasterStatus = useCallback(
    async (org: PlatformOrganization, desired: boolean) => {
      setMasterUpdateError(null);
      setMasterUpdateMessage(null);
      setUpdatingMaster(true);
      try {
        await fetchJSON<{ organization: PlatformOrganization["organization"] }>(
          `${API_URL}/api/admin/organizations/${org.organization.id}/master`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isMaster: desired }),
          },
        );
        setMasterUpdateMessage(
          desired
            ? `${org.organization.name} is now marked as a master organization.`
            : `${org.organization.name} is no longer marked as a master organization.`,
        );
        await loadOverview();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setMasterUpdateError(message || "Failed to update master status");
      } finally {
        setUpdatingMaster(false);
      }
    },
    [loadOverview],
  );

  const closeKeyModal = () => setKeyModal(null);

  if (!hasPlatformAccess) {
    return (
      <div className="admin-container">
        <div className="card">
          <h1>WeRobots platform console</h1>
          {loading ? (
            <p>Loading user session...</p>
          ) : (
            <p>Master owner or sysadmin access required.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <KeyRevealModal
        isOpen={Boolean(keyModal)}
        keys={keyModal?.keys ?? []}
        context={keyModal?.context ?? ""}
        title={keyModal?.title ?? "Secret revealed"}
        onClose={closeKeyModal}
      />
      <header className="page-header">
        <div>
          <h1>WeRobots platform console</h1>
          <p>Inspect tenant health, usage, and credentials across the entire platform.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => void loadOverview()} disabled={loadingOverview}>
            {loadingOverview ? "Refreshing..." : "Refresh data"}
          </button>
        </div>
      </header>
      {error && <div className="notice error">{error}</div>}
      {loadingOverview && !overview && <div className="notice info">Loading overview...</div>}
      {overview ? (
        <>
          <div className="summary-grid">
            <div className="summary-card">
              <span className="label">Gross billed</span>
              <span className="value">{formatCurrency(overview.totals.totalBilled)}</span>
            </div>
            <div className="summary-card">
              <span className="label">OpenAI spend</span>
              <span
                className="value"
                title={`$${overview.totals.totalTokenCost}`}
              >
                {formatCurrency(overview.totals.totalTokenCost, 4)}
              </span>
            </div>
            <div className="summary-card">
              <span className="label">Net revenue</span>
              <span
                className={`value ${overview.totals.netRevenue >= 0 ? "positive" : "negative"}`}
              >
                {formatCurrency(overview.totals.netRevenue)}
              </span>
              <span className="subtext">Margin {profitMargin.toFixed(1)}%</span>
            </div>
            <div className="summary-card">
              <span className="label">Client top-ups</span>
              <span className="value">{formatCurrency(overview.totals.totalTopUps)}</span>
            </div>
            <div className="summary-card">
              <span className="label">Credits on account</span>
              <span className="value">{formatCurrency(overview.totals.totalCredits)}</span>
            </div>
            <div className="summary-card">
              <span className="label">Organizations</span>
              <span className="value">{overview.totals.organizationCount}</span>
            </div>
            <div className="summary-card">
              <span className="label">Active members</span>
              <span className="value">{overview.totals.activeMemberCount}</span>
            </div>
            <div className="summary-card">
              <span className="label">API keys</span>
              <span className="value">{overview.totals.apiKeyCount}</span>
            </div>
          </div>
          <div className="console-layout">
            <aside className="org-panel">
              <div className="org-header">
                <div className="org-header-left">
                  <h2>Organizations</h2>
                  <div className="org-filters">
                    <button
                      type="button"
                      className={filter === "all" ? "active" : undefined}
                      onClick={() => setFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={filter === "master" ? "active" : undefined}
                      onClick={() => setFilter("master")}
                    >
                      Master orgs
                    </button>
                    <button
                      type="button"
                      className={filter === "tenant" ? "active" : undefined}
                      onClick={() => setFilter("tenant")}
                    >
                      Tenants
                    </button>
                  </div>
                </div>
                <input
                  type="search"
                  placeholder="Search by name or slug"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="org-table-wrapper">
                <table className="org-table">
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Billed</th>
                      <th>OpenAI</th>
                      <th>Net</th>
                      <th>Credits</th>
                      <th>Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrganizations.length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty-row">
                          No organizations match that filter.
                        </td>
                      </tr>
                    )}
                    {filteredOrganizations.map((entry) => (
                      <tr
                        key={entry.organization.id}
                        className={
                          entry.organization.id === selectedOrgId ? "active" : undefined
                        }
                        onClick={() => setSelectedOrgId(entry.organization.id)}
                      >
                        <td>
                          <div className="org-name">
                            <strong>{entry.organization.name}</strong>
                            <span>{entry.organization.slug}</span>
                            {entry.organization.isMaster && (
                              <span className="tag master">Master</span>
                            )}
                          </div>
                        </td>
                        <td>{formatCurrency(entry.usage.totalBilled)}</td>
                        <td title={`$${entry.usage.totalTokenCost}`}>
                          {formatCurrency(entry.usage.totalTokenCost, 4)}
                        </td>
                        <td className={entry.usage.netRevenue >= 0 ? "positive" : "negative"}>
                          {formatCurrency(entry.usage.netRevenue)}
                        </td>
                        <td>{formatCurrency(entry.organization.credits)}</td>
                        <td>{entry.usage.totalRequests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </aside>
            <section className="detail-panel">
              {selectedOrganization ? (
                <>
                  <header className="detail-header">
                    <div>
                      <h2>{selectedOrganization.organization.name}</h2>
                      <p className="muted">{selectedOrganization.organization.slug}</p>
                      <span
                        className={`tag ${selectedOrganization.organization.isMaster ? "master" : "tenant"}`}
                      >
                        {selectedOrganization.organization.isMaster
                          ? "Master organization"
                          : "Tenant organization"}
                      </span>
                    </div>
                    <div className="detail-actions">
                      <button type="button" onClick={() => void loadOverview()} disabled={loadingOverview}>
                        {loadingOverview ? "Refreshing..." : "Refresh org"}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          toggleMasterStatus(
                            selectedOrganization,
                            !selectedOrganization.organization.isMaster,
                          )
                        }
                        disabled={updatingMaster}
                      >
                        {updatingMaster
                          ? "Updating..."
                          : selectedOrganization.organization.isMaster
                          ? "Remove master status"
                          : "Make master org"}
                      </button>
                    </div>
                  </header>
                  {(masterUpdateMessage || masterUpdateError) && (
                    <div className={`notice ${masterUpdateError ? "error" : "success"}`}>
                      {masterUpdateError ?? masterUpdateMessage}
                    </div>
                  )}
                  <div className="detail-grid">
                    <div className="detail-card">
                      <span className="label">Gross billed</span>
                      <span className="value">{formatCurrency(selectedMetrics.billed)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="label">OpenAI spend</span>
                      <span
                        className="value"
                        title={`$${selectedMetrics.tokenCost}`}
                      >
                        {formatCurrency(selectedMetrics.tokenCost, 4)}
                      </span>
                    </div>
                    <div className="detail-card">
                      <span className="label">Net revenue</span>
                      <span
                        className={`value ${selectedMetrics.net >= 0 ? "positive" : "negative"}`}
                      >
                        {formatCurrency(selectedMetrics.net)}
                      </span>
                    </div>
                    <div className="detail-card">
                      <span className="label">Top-ups collected</span>
                      <span className="value">{formatCurrency(selectedMetrics.topUps)}</span>
                      <span className="subtext">
                        {selectedMetrics.lastTopUpAt
                          ? `Last top-up ${new Date(selectedMetrics.lastTopUpAt).toLocaleString()}`
                          : "No top-ups yet"}
                      </span>
                    </div>
                    <div className="detail-card">
                      <span className="label">Credits</span>
                      <span className="value">{formatCurrency(selectedMetrics.credits)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="label">Requests</span>
                      <span className="value">{selectedMetrics.requests}</span>
                    </div>
                    <div className="detail-card">
                      <span className="label">Active members</span>
                      <span className="value">{selectedMetrics.members}</span>
                    </div>
                    <div className="detail-card">
                      <span className="label">API keys</span>
                      <span className="value">{selectedMetrics.keys}</span>
                    </div>
                  </div>
                  <div className="detail-section">
                    <h3>API key sets</h3>
                    {selectedOrganization.organization.keySets.length === 0 && (
                      <p className="muted">No key sets provisioned yet.</p>
                    )}
                    {selectedOrganization.organization.keySets.map((set) => (
                      <div key={set.id} className="keyset">
                        <div className="keyset-header">
                          <div>
                            <h4>{set.name}</h4>
                            <p className="meta">
                              Created {new Date(set.createdAt).toLocaleString()} by {set.createdBy}
                            </p>
                          </div>
                        </div>
                        <p>{set.description}</p>
                        <ul>
                          {set.keys.map((key, index) => {
                            const billed = key.usage.reduce((sum, entry) => sum + entry.billedCost, 0);
                            const tokenCost = key.usage.reduce(
                              (sum, entry) => sum + (entry.tokenCost ?? 0),
                              0,
                            );
                            const requests = key.usage.reduce(
                              (sum, entry) => sum + entry.requests,
                              0,
                            );
                            const lastAccessedDate = key.lastAccessed
                              ? new Date(key.lastAccessed)
                              : null;
                            const lastAccessedLabel = lastAccessedDate
                              ? lastAccessedDate.toLocaleString()
                              : null;
                            return (
                              <li key={key.id}>
                                <div className="key-info">
                                  <code>{key.maskedKey}</code>
                                  <div className="meta-group">
                                    <span className="meta">
                                      Rotated {new Date(key.lastRotated).toLocaleString()}
                                    </span>
                                    <span
                                      className="meta"
                                      title={lastAccessedDate ? lastAccessedDate.toISOString() : undefined}
                                    >
                                      {lastAccessedLabel
                                        ? `Last used ${lastAccessedLabel}`
                                        : "Never used"}
                                    </span>
                                  </div>
                                </div>
                                <div className="key-actions">
                                  <button
                                    type="button"
                                    onClick={() => rotateKey(selectedOrganization, set.id, index)}
                                  >
                                    Rotate
                                  </button>
                                  <span className="key-usage">
                                    <span>{requests} req</span>
                                    <span>billed {formatCurrency(billed)}</span>
                                    <span title={`$${tokenCost}`}>
                                      OpenAI {formatCurrency(tokenCost, 4)}
                                    </span>
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="detail-section">
                    <h3>Usage history</h3>
                    <UsageBreakdown entries={selectedOrgUsageEntries} />
                    <div className="topup-summary">
                      <h4>Top-ups</h4>
                      {selectedOrgTopUps.length > 0 ? (
                        <>
                          <p className="muted">
                            {selectedOrgTopUpSummary.count === 1
                              ? `1 top-up totaling ${formatCurrency(selectedOrgTopUpSummary.totalAmount)}`
                              : `${selectedOrgTopUpSummary.count} top-ups totaling ${formatCurrency(selectedOrgTopUpSummary.totalAmount)}`}
                            {selectedOrgTopUpSummary.lastTimestamp
                              ? ` (last on ${new Date(selectedOrgTopUpSummary.lastTimestamp).toLocaleString()})`
                              : ""}
                            .
                          </p>
                          <ul className="topup-history">
                            {selectedOrgTopUps
                              .slice()
                              .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
                              .map((entry, index) => (
                                <li key={`${entry.timestamp}-${index}`}>
                                  <span>{new Date(entry.timestamp).toLocaleString()}</span>
                                  <span className="amount">+{formatCurrency(Math.abs(entry.billedCost))}</span>
                                </li>
                              ))}
                          </ul>
                        </>
                      ) : (
                        <p className="muted">No top-ups recorded.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <p>Select an organization to inspect usage and credentials.</p>
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="card">
          <p>No organizations have been registered yet.</p>
        </div>
      )}
      <style jsx>{`
        .admin-container {
          flex: 1 1 auto;
          background: #f0f2f5;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .card {
          background: #fff;
          padding: 1rem;
          border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .page-header h1 {
          margin: 0;
        }
        .page-header p {
          margin: 0.25rem 0 0;
          color: #595959;
        }
        .actions button,
        .detail-actions button {
          padding: 0.5rem 0.9rem;
          border: none;
          border-radius: 6px;
          background: #1890ff;
          color: #fff;
          cursor: pointer;
        }
        .actions button:disabled,
        .detail-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .detail-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .detail-actions .secondary {
          background: #fff;
          color: #1890ff;
          border: 1px solid #1890ff;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }
        .summary-card {
          background: #fff;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .summary-card .label {
          font-size: 0.8rem;
          color: #595959;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .summary-card .value {
          font-size: 1.4rem;
          font-weight: 600;
        }
        .summary-card .value.positive {
          color: #237804;
        }
        .summary-card .value.negative {
          color: #cf1322;
        }
        .summary-card .subtext {
          font-size: 0.8rem;
          color: #8c8c8c;
        }
        .console-layout {
          display: grid;
          grid-template-columns: minmax(280px, 360px) 1fr;
          gap: 1.5rem;
          align-items: start;
        }
        .org-panel {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
        }
        .org-header {
          padding: 1rem;
          border-bottom: 1px solid #f0f0f0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .org-header-left {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .org-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .org-filters button {
          padding: 0.3rem 0.6rem;
          border: 1px solid #d9d9d9;
          border-radius: 999px;
          background: #fff;
          color: #595959;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .org-filters button.active {
          background: #1890ff;
          color: #fff;
          border-color: #1890ff;
        }
        .org-header h2 {
          margin: 0;
        }
        .org-header input {
          padding: 0.5rem 0.75rem;
          border: 1px solid #d9d9d9;
          border-radius: 6px;
        }
        .org-table-wrapper {
          overflow-x: auto;
        }
        .org-table {
          width: 100%;
          border-collapse: collapse;
        }
        .org-table th,
        .org-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.9rem;
        }
        .org-table tbody tr {
          cursor: pointer;
        }
        .org-table tbody tr:hover {
          background: #f5faff;
        }
        .org-table tbody tr.active {
          background: #e6f7ff;
        }
        .org-table td.positive {
          color: #237804;
        }
        .org-table td.negative {
          color: #cf1322;
        }
        .org-name {
          display: flex;
          flex-direction: column;
        }
        .org-name span {
          font-size: 0.75rem;
          color: #8c8c8c;
        }
        .tag {
          display: inline-flex;
          align-items: center;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          background: #f0f0f0;
          color: #555;
        }
        .tag.master {
          background: #e6f7ff;
          color: #096dd9;
        }
        .tag.tenant {
          background: #f9f0ff;
          color: #722ed1;
        }
        .org-name .tag {
          margin-top: 0.35rem;
        }
        .detail-header .tag {
          margin-top: 0.25rem;
        }
        .empty-row {
          text-align: center;
          color: #8c8c8c;
        }
        .detail-panel {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .detail-header h2 {
          margin: 0;
        }
        .muted {
          color: #8c8c8c;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }
        .detail-card {
          background: #fafafa;
          border: 1px solid #f0f0f0;
          border-radius: 6px;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .detail-card .label {
          font-size: 0.8rem;
          color: #595959;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .detail-card .value {
          font-size: 1.2rem;
          font-weight: 600;
        }
        .detail-card .value.positive {
          color: #237804;
        }
        .detail-card .value.negative {
          color: #cf1322;
        }
        .detail-card .subtext {
          font-size: 0.75rem;
          color: #8c8c8c;
        }
        .detail-section h3 {
          margin-top: 0;
        }
        .topup-summary {
          margin-top: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .topup-summary h4 {
          margin: 0;
        }
        .topup-summary .muted {
          margin: 0;
          font-size: 0.9rem;
        }
        .topup-history {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 0.3rem;
        }
        .topup-history li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f7f9fc;
          border: 1px solid #eef2f7;
          border-radius: 4px;
          padding: 0.35rem 0.5rem;
          font-size: 0.9rem;
        }
        .topup-history .amount {
          font-weight: 600;
          color: #237804;
        }
        .keyset {
          border-top: 1px solid #f0f0f0;
          padding-top: 0.75rem;
          margin-top: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .keyset-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .keyset h4 {
          margin: 0;
        }
        .keyset ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .keyset li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
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
        .meta-group {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: #777;
        }
        .key-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }
        .key-actions button {
          padding: 0.3rem 0.7rem;
          border: none;
          border-radius: 4px;
          background: #1890ff;
          color: #fff;
          cursor: pointer;
        }
        .key-actions .key-usage {
          font-size: 0.8rem;
          color: #595959;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .key-actions .key-usage span + span::before {
          content: "·";
          color: #bfbfbf;
          margin: 0 0.25rem;
        }
        .empty-state {
          background: #fafafa;
          border: 1px dashed #d9d9d9;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          color: #8c8c8c;
        }
        .notice {
          padding: 0.85rem 1rem;
          border-radius: 6px;
          font-size: 0.95rem;
        }
        .notice.error {
          background: #fff2f0;
          border: 1px solid #ffccc7;
        }
        .notice.success {
          background: #f6ffed;
          border: 1px solid #b7eb8f;
        }
        .notice.info {
          background: #e6f7ff;
          border: 1px solid #91d5ff;
        }
        @media (max-width: 1024px) {
          .console-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .page-header {
            flex-direction: column;
          }
          .org-panel {
            order: 2;
          }
        }
      `}</style>
    </div>
  );
}
