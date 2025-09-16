import { useEffect, useState } from "react";
import UsageBreakdown from "@/components/UsageBreakdown";
import { fetchJSON } from "@/lib/api";
import {
  SafeApiKey,
  SafeKeySet,
  SafeOrganization,
  UsageEntry,
} from "@/types/account";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type KeyReveal = {
  keys: string[];
  context: string;
};

type AdminOrganization = SafeOrganization;

type OrganizationResponse = {
  organizations: AdminOrganization[];
};

type RotateResponse = {
  apiKey: string;
  key: SafeApiKey;
};

export default function AdminOrganizations() {
  const { user, loading } = useAuth();
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<KeyReveal | null>(null);

  const isSysAdmin = Boolean(user?.globalRoles.includes("SYSADMIN"));

  useEffect(() => {
    if (!isSysAdmin) return;
    fetchJSON<OrganizationResponse>(`${API_URL}/api/admin/organizations`)
      .then((data) => setOrganizations(data.organizations))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Failed to load organizations");
      });
  }, [isSysAdmin]);

  const rotate = async (orgId: string, setId: string, index: number) => {
    const result = await fetchJSON<RotateResponse>(
      `${API_URL}/api/admin/organizations/${orgId}/keysets/${setId}/keys/${index}/rotate`,
      { method: "POST" },
    );
    setReveal({
      keys: [result.apiKey],
      context: `Rotated key for organization ${orgId}. Share securely with the client.`,
    });
    const refreshed = await fetchJSON<OrganizationResponse>(
      `${API_URL}/api/admin/organizations`,
    );
    setOrganizations(refreshed.organizations);
  };

  if (!isSysAdmin) {
    return (
      <div className="admin-container">
        <div className="card">
          <h1>Admin dashboard</h1>
          {loading ? <p>Loading user session...</p> : <p>Sysadmin access required.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <h1>Organizations</h1>
      {error && <div className="notice error">{error}</div>}
      {reveal && (
        <div className="notice warning">
          <strong>New API key</strong>
          <p>{reveal.context}</p>
          <ul>
            {reveal.keys.map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {organizations.map((org) => (
        <div key={org.id} className="card">
          <h2>
            {org.name} &mdash; ${org.credits.toFixed(2)} credits
          </h2>
          <div className="keysets">
            {org.keySets.map((ks) => (
              <div key={ks.id} className="keyset">
                <h3>{ks.name}</h3>
                <p>{ks.description}</p>
                <ul>
                  {ks.keys.map((k, idx) => renderKey(org.id, ks, k, idx, rotate))}
                </ul>
              </div>
            ))}
          </div>
          <div className="usage">
            <h3>Usage</h3>
            <UsageBreakdown entries={org.usage.filter(filterTopups)} />
          </div>
        </div>
      ))}
      <style jsx>{`
        .admin-container {
          padding: 1rem;
          background: #f0f2f5;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .card {
          background: #fff;
          padding: 1rem;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .keyset {
          border-top: 1px solid #eee;
          margin-top: 0.5rem;
          padding-top: 0.5rem;
        }
        .keysets ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .keysets li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.25rem 0;
        }
        .key-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .key-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }
        .key-actions button {
          padding: 0.25rem 0.5rem;
        }
        .usage {
          font-size: 0.9rem;
        }
        .summary {
          font-size: 0.9rem;
          color: #333;
        }
        button {
          padding: 0.25rem 0.5rem;
        }
        .notice {
          padding: 0.75rem;
          border-radius: 4px;
        }
        .notice.error {
          background: #fff2f0;
          border: 1px solid #ffccc7;
        }
        .notice.warning {
          background: #fff7e6;
          border: 1px solid #ffd591;
        }
        .notice.warning ul {
          list-style: none;
          margin: 0.5rem 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .notice.warning code {
          background: #000;
          color: #fff;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          display: inline-block;
        }
      `}</style>
    </div>
  );
}

function renderKey(
  orgId: string,
  set: SafeKeySet,
  key: SafeApiKey,
  index: number,
  rotate: (orgId: string, setId: string, index: number) => Promise<void>,
) {
  const reqs = key.usage.reduce((a, b) => a + b.requests, 0);
  const billed = key.usage.reduce((a, b) => a + b.billedCost, 0);
  return (
    <li key={key.id}>
      <div className="key-info">
        <code>{key.maskedKey}</code>
        <span>
          rotated {new Date(key.lastRotated).toLocaleString()}
        </span>
      </div>
      <div className="key-actions">
        <button onClick={() => rotate(orgId, set.id, index)}>Rotate</button>
        <span className="summary">
          {reqs} reqs / billed {billed.toFixed(2)}
        </span>
      </div>
    </li>
  );
}

function filterTopups(entry: UsageEntry) {
  return entry.action !== "topup";
}
