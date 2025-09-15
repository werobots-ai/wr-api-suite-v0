import { useEffect, useState } from "react";
import UsageBreakdown, { UsageEntry } from "@/components/UsageBreakdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type ApiKey = {
  id: string;
  key: string;
  lastRotated: string;
  usage: UsageEntry[];
};

type KeySet = {
  id: string;
  name: string;
  description: string;
  keys: ApiKey[];
};

type User = {
  id: string;
  name: string;
  credits: number;
  usage: UsageEntry[];
  keySets: KeySet[];
};

const mask = (key: string) => key.replace(/.(?=.{4})/g, "*");

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);

  const load = async () => {
    const res = await fetch(`${API_URL}/api/admin/users`);
    const json = await res.json();
    setUsers(json);
  };

  useEffect(() => {
    load();
  }, []);

  const rotate = async (userId: string, setId: string, index: number) => {
    await fetch(
      `${API_URL}/api/admin/users/${userId}/keysets/${setId}/keys/${index}/rotate`,
      { method: "POST" },
    );
    load();
  };

  return (
    <div className="container">
      <h1>Users</h1>
      {users.map((u) => (
        <div key={u.id} className="user-card">
          <h2>
            {u.name} - {u.credits.toFixed(2)} credits
          </h2>
          {(() => {
            const usage = u.usage.filter((e) => e.action !== "topup");
            const totalRequests = usage.reduce((a, b) => a + b.requests, 0);
            const totalBilled = usage.reduce((a, b) => a + b.billedCost, 0);
            const totalCost = usage.reduce((a, b) => a + b.tokenCost, 0);
            return (
              <p className="summary">
                {totalRequests} reqs / billed {totalBilled.toFixed(2)} / cost
                {" "}
                {totalCost.toFixed(2)} / profit {(totalBilled - totalCost).toFixed(2)}
              </p>
            );
          })()}
          <div className="keysets">
            {u.keySets.map((ks) => (
              <div key={ks.id} className="keyset">
                <h3>{ks.name}</h3>
                <p>{ks.description}</p>
                <ul>
                  {ks.keys.map((k, idx) => (
                    <li key={k.id}>
                      <div className="key-info">
                        <code>{mask(k.key)}</code>
                        <span>
                          rotated {new Date(k.lastRotated).toLocaleString()}
                        </span>
                      </div>
                      <div className="key-actions">
                        <button onClick={() => rotate(u.id, ks.id, idx)}>
                          Rotate
                        </button>
                        {(() => {
                          const reqs = k.usage.reduce((a, b) => a + b.requests, 0);
                          const billed = k.usage.reduce(
                            (a, b) => a + b.billedCost,
                            0,
                          );
                          const cost = k.usage.reduce(
                            (a, b) => a + b.tokenCost,
                            0,
                          );
                          return (
                            <span className="usage">
                              {reqs} reqs / billed {billed.toFixed(2)} / cost
                              {" "}
                              {cost.toFixed(2)} / profit {(billed - cost).toFixed(2)}
                            </span>
                          );
                        })()}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="usage">
            <h3>Usage</h3>
            <UsageBreakdown entries={u.usage} />
          </div>
        </div>
      ))}
      <style jsx>{`
        .container {
          padding: 1rem;
          background: #f0f2f5;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .user-card {
          background: #fff;
          padding: 1rem;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .keyset {
          border-top: 1px solid #eee;
          margin-top: 0.5rem;
          padding-top: 0.5rem;
        }
        .key-info {
          display: flex;
          flex-direction: column;
        }
        ul {
          list-style: none;
          padding: 0;
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
        .usage {
          font-size: 0.8rem;
        }
        .summary {
          font-size: 0.9rem;
          color: #333;
        }
        button {
          padding: 0.25rem 0.5rem;
        }
      `}</style>
    </div>
  );
}

