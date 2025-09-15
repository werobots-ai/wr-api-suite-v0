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

type UserData = {
  credits: number;
  usage: UsageEntry[];
  keySets: KeySet[];
};

type Pricing = {
  questionGeneration: number;
  questionAnswering: number;
};

const mask = (key: string) => key.replace(/.(?=.{4})/g, "*");

export default function BillingPage() {
  const [data, setData] = useState<UserData | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [newSet, setNewSet] = useState({ name: "", description: "" });

  const load = async () => {
    const res = await fetch(`${API_URL}/api/account`);
    const json = await res.json();
    setData(json);
  };

  useEffect(() => {
    load();
    fetch(`${API_URL}/api/pricing`)
      .then((r) => r.json())
      .then(setPricing);
  }, []);

  const topUp = async () => {
    await fetch(`${API_URL}/api/account/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    setAmount(0);
    load();
  };

  const rotate = async (setId: string, index: number) => {
    await fetch(`${API_URL}/api/account/keysets/${setId}/keys/${index}/rotate`, {
      method: "POST",
    });
    load();
  };

  const addKeySet = async () => {
    await fetch(`${API_URL}/api/account/keysets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSet),
    });
    setNewSet({ name: "", description: "" });
    load();
  };

  const removeSet = async (id: string) => {
    await fetch(`${API_URL}/api/account/keysets/${id}`, { method: "DELETE" });
    load();
  };

  if (!data) return <div>Loading...</div>;

  return (
    <div className="container">
      <h1>Usage &amp; Billing</h1>
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
        <p>Credits: {data.credits.toFixed(2)}</p>
        <div className="topup">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="Amount"
          />
          <button onClick={topUp}>Top Up</button>
        </div>
      </div>

      <div className="card">
        <h2>API Key Sets</h2>
        {data.keySets.map((set) => (
          <div key={set.id} className="keyset">
            <div className="keyset-header">
              <h3>{set.name}</h3>
              <button onClick={() => removeSet(set.id)}>Remove</button>
            </div>
            <p>{set.description}</p>
            <ul>
              {set.keys.map((k, idx) => {
                const total = k.usage.reduce((a, b) => a + b.cost, 0);
                return (
                  <li key={k.id}>
                    <div className="key-info">
                      <code>{mask(k.key)}</code>
                      <span className="rotated">
                        rotated {new Date(k.lastRotated).toLocaleString()}
                      </span>
                    </div>
                    <div className="key-actions">
                      <button onClick={() => rotate(set.id, idx)}>Rotate</button>
                      <span className="usage">
                        {k.usage.length} reqs / {total.toFixed(2)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
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
          <button onClick={addKeySet}>Add Key Set</button>
        </div>
      </div>

      <div className="card">
        <h2>Usage</h2>
        <ul>
          {data.usage.map((u, idx) => (
            <li key={idx}>
              {u.timestamp}: {u.action} - {u.cost}
            </li>
          ))}
        </ul>
      </div>

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
        }
        .key-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .rotated {
          font-size: 0.8rem;
          color: #666;
        }
        .usage {
          font-size: 0.8rem;
          color: #333;
        }
        .add-set {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }
        .topup {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
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
        input {
          padding: 0.5rem;
          flex: 1;
        }
        button {
          padding: 0.5rem 1rem;
        }
      `}</style>
    </div>
  );
}
