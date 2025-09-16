import { useCallback, useEffect, useMemo, useState } from "react";
import UsageBreakdown from "@/components/UsageBreakdown";
import KeyRevealModal from "@/components/KeyRevealModal";
import { fetchJSON } from "@/lib/api";
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

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function AdminConsole() {
  const { user, loading } = useAuth();
  const isSysAdmin = Boolean(user?.globalRoles.includes("SYSADMIN"));

  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [keyModal, setKeyModal] = useState<{ keys: string[]; context: string; title: string } | null>(
    null,
  );
  const [search, setSearch] = useState("");

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
    if (!isSysAdmin) return;
    void loadOverview();
  }, [isSysAdmin, loadOverview]);

  useEffect(() => {
    if (!overview) return;
    const firstId = overview.organizations[0]?.organization.id ?? null;
    if (!selectedOrgId && firstId) {
      setSelectedOrgId(firstId);
    } else if (
      selectedOrgId &&
      !overview.organizations.some((entry) => entry.organization.id === selectedOrgId) &&
      firstId &&
      firstId !== selectedOrgId
    ) {
      setSelectedOrgId(firstId);
    }
  }, [overview, selectedOrgId]);

  const filteredOrganizations = useMemo(() => {
    if (!overview) return [] as PlatformOrganization[];
    const term = search.trim().toLowerCase();
    if (!term) return overview.organizations;
    return overview.organizations.filter((entry) =>
      [entry.organization.name, entry.organization.slug]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [overview, search]);

  const selectedOrganization = useMemo(() => {
    if (!overview || !selectedOrgId) return null;
    return (
      overview.organizations.find((entry) => entry.organization.id === selectedOrgId) || null
    );
  }, [overview, selectedOrgId]);

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

  const closeKeyModal = () => setKeyModal(null);

  if (!isSysAdmin) {
    return (
      <div className="admin-container">
        <div className="card">
          <h1>WeRobots platform console</h1>
          {loading ? <p>Loading user session...</p> : <p>Sysadmin access required.</p>}
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
              <span className="value">{formatCurrency(overview.totals.totalTokenCost)}</span>
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
                <h2>Organizations</h2>
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
                          </div>
                        </td>
                        <td>{formatCurrency(entry.usage.totalBilled)}</td>
                        <td>{formatCurrency(entry.usage.totalTokenCost)}</td>
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
                    </div>
                    <div className="detail-actions">
                      <button type="button" onClick={() => void loadOverview()} disabled={loadingOverview}>
                        {loadingOverview ? "Refreshing..." : "Refresh org"}
                      </button>
                    </div>
                  </header>
                  <div className="detail-grid">
                    <div className="detail-card">
                      <span className="label">Gross billed</span>
                      <span className="value">{formatCurrency(selectedMetrics.billed)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="label">OpenAI spend</span>
                      <span className="value">{formatCurrency(selectedMetrics.tokenCost)}</span>
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
                              (sum, entry) => sum + entry.tokenCost,
                              0,
                            );
                            const requests = key.usage.reduce(
                              (sum, entry) => sum + entry.requests,
                              0,
                            );
                            return (
                              <li key={key.id}>
                                <div className="key-info">
                                  <code>{key.maskedKey}</code>
                                  <span className="meta">
                                    Rotated {new Date(key.lastRotated).toLocaleString()}
                                  </span>
                                </div>
                                <div className="key-actions">
                                  <button
                                    type="button"
                                    onClick={() => rotateKey(selectedOrganization, set.id, index)}
                                  >
                                    Rotate
                                  </button>
                                  <span className="key-usage">
                                    {requests} req · billed {formatCurrency(billed)} · OpenAI {formatCurrency(tokenCost)}
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
                    <UsageBreakdown entries={selectedOrganization.organization.usage} />
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
