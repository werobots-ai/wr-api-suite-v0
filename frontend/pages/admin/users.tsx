import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type UsageEntry = {
  timestamp: string;
  action: string;
  cost: number;
};

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
                      <button onClick={() => rotate(u.id, ks.id, idx)}>
                        Rotate
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="usage">
            <h3>Usage</h3>
            <ul>
              {u.usage.map((e, i) => (
                <li key={i}>
                  {e.timestamp}: {e.action} - {e.cost}
                </li>
              ))}
            </ul>
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
        button {
          padding: 0.25rem 0.5rem;
        }
      `}</style>
    </div>
  );
}

