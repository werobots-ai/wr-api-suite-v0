import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type UsageEntry = {
  timestamp: string;
  action: string;
  cost: number;
};

type UserData = {
  credits: number;
  usage: UsageEntry[];
  apiKeys: { id: string; key: string }[];
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

  const rotate = async (index: number) => {
    await fetch(`${API_URL}/api/account/keys/rotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
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
        <h2>API Keys</h2>
        <ul>
          {data.apiKeys.map((k, idx) => (
            <li key={k.id}>
              <code>{mask(k.key)}</code>
              <button onClick={() => rotate(idx)}>Rotate</button>
            </li>
          ))}
        </ul>
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
