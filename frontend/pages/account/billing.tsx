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

export default function BillingPage() {
  const [data, setData] = useState<UserData | null>(null);
  const [amount, setAmount] = useState<number>(0);

  const load = async () => {
    const res = await fetch(`${API_URL}/api/account`);
    const json = await res.json();
    setData(json);
  };

  useEffect(() => {
    load();
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
    <div style={{ padding: "1rem" }}>
      <h1>Usage & Billing</h1>
      <p>Credits: {data.credits.toFixed(2)}</p>
      <div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          placeholder="Amount"
        />
        <button onClick={topUp}>Top Up</button>
      </div>

      <h2>API Keys</h2>
      <ul>
        {data.apiKeys.map((k, idx) => (
          <li key={k.id}>
            <code>{k.key}</code>
            <button onClick={() => rotate(idx)}>Rotate</button>
          </li>
        ))}
      </ul>

      <h2>Usage</h2>
      <ul>
        {data.usage.map((u, idx) => (
          <li key={idx}>
            {u.timestamp}: {u.action} - {u.cost}
          </li>
        ))}
      </ul>
    </div>
  );
}
