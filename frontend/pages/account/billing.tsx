import { useCallback, useEffect, useMemo, useState } from "react";
import UsageBreakdown from "@/components/UsageBreakdown";
import { fetchJSON } from "@/lib/api";
import { OrgRole, SafeApiKey, SafeKeySet, SafeUser, UsageEntry } from "@/types/account";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Pricing = {
  questionGeneration: number;
  questionAnswering: number;
};

type MemberInfo = SafeUser & { roles: OrgRole[] };

type KeyReveal = {
  keys: string[];
  context: string;
};

const ROLE_OPTIONS: { label: string; value: OrgRole }[] = [
  { label: "Owner", value: "OWNER" },
  { label: "Admin", value: "ADMIN" },
  { label: "Billing", value: "BILLING" },
  { label: "Member", value: "MEMBER" },
];

export default function BillingPage() {
  const { organization, permissions, refreshAccount, loading } = useAuth();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [newSet, setNewSet] = useState({ name: "", description: "" });
  const [reveals, setReveals] = useState<KeyReveal | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [memberForm, setMemberForm] = useState({
    email: "",
    name: "",
    roles: ["MEMBER"] as OrgRole[],
    password: "",
  });
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  const canManageKeys = Boolean(permissions?.manageKeys);
  const canManageBilling = Boolean(permissions?.manageBilling);
  const canManageUsers = Boolean(permissions?.manageUsers);
  const canViewMembers = canManageUsers || canManageBilling;

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
    setReveals(null);
    await refreshAccount();
  };

  const handleRotate = async (setId: string, index: number) => {
    if (!canManageKeys) return;
    const result = await fetchJSON<{
      apiKey: string;
      key: SafeApiKey;
    }>(`${API_URL}/api/account/keysets/${setId}/keys/${index}/rotate`, {
      method: "POST",
    });
    setReveals({
      keys: [result.apiKey],
      context: "Rotated API key. Store this new value securely.",
    });
    await refreshAccount();
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
    setNewSet({ name: "", description: "" });
    setReveals({
      keys: result.revealedKeys,
      context: `Key set "${result.keySet.name}" created. Share these keys only with trusted clients.`,
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
      <h1>{organization.name} &mdash; Usage &amp; Billing</h1>
      {reveals && (
        <div className="card warning">
          <h2>New credentials</h2>
          <p>{reveals.context}</p>
          <ul>
            {reveals.keys.map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pricing && (
        <div className="card">
          <h2>Pricing</h2>
          <p>
            Question generation: ${pricing.questionGeneration.toFixed(2)} per
            question
          </p>
          <p>
            Question answering: ${pricing.questionAnswering.toFixed(2)} per
            question
          </p>
        </div>
      )}
      <div className="card">
        <h2>Credits</h2>
        <p className="metric">${organization.credits.toFixed(2)}</p>
        {canManageBilling && (
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
        )}
      </div>

      <div className="card">
        <h2>API Key Sets</h2>
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
            <ul>
              {set.keys.map((k, idx) => {
                const total = k.usage.reduce((a, b) => a + b.billedCost, 0);
                const reqs = k.usage.reduce((a, b) => a + b.requests, 0);
                return (
                  <li key={k.id}>
                    <div className="key-info">
                      <code>{k.maskedKey}</code>
                      <span className="rotated">
                        rotated {new Date(k.lastRotated).toLocaleString()}
                      </span>
                    </div>
                    <div className="key-actions">
                      {canManageKeys && (
                        <button onClick={() => handleRotate(set.id, idx)}>
                          Rotate
                        </button>
                      )}
                      <span className="usage">
                        {reqs} reqs / {total.toFixed(2)} billed
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
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
              onChange={(e) =>
                setNewSet({ ...newSet, description: e.target.value })
              }
            />
            <button onClick={handleAddKeySet} disabled={!newSet.name}>
              Add Key Set
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Usage</h2>
        <UsageBreakdown entries={organizationUsage} />
      </div>

      {canViewMembers && (
        <div className="card">
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
        </div>
      )}

      <style jsx>{`
        .container {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          background: #f0f2f5;
          padding: 1rem;
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
        .card.warning {
          border-left: 4px solid #faad14;
        }
        .card.warning ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .card.warning code {
          background: #000;
          color: #fff;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          display: inline-block;
        }
        .metric {
          font-size: 2rem;
          font-weight: 600;
        }
        .topup {
          display: flex;
          gap: 0.5rem;
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
        }
        .keyset-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .key-info {
          display: flex;
          flex-direction: column;
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
          padding: 0.25rem 0;
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
          font-size: 0.85rem;
          color: #555;
        }
        .rotated {
          font-size: 0.75rem;
          color: #777;
        }
        .add-set {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
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
      `}</style>
    </div>
  );
}
