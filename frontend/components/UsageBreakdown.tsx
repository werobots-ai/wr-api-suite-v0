import { useState } from "react";

export type UsageEntry = {
  timestamp: string;
  action: string;
  tokenCost: number;
  billedCost: number;
  requests: number;
  question?: string;
};

export default function UsageBreakdown({ entries }: { entries: UsageEntry[] }) {
  const [filter, setFilter] = useState("");
  const filtered = entries.filter(
    (e) =>
      e.action.toLowerCase().includes(filter.toLowerCase()) ||
      (e.question || "").toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <details>
      <summary>
        Usage Events ({entries.length})
      </summary>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by question or action"
        className="filter"
      />
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Question</th>
            <th>Billed ($)</th>
            <th>OpenAI ($)</th>
            <th>Net ($)</th>
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e, i) => {
            const net = e.billedCost - e.tokenCost;
            return (
              <tr key={i}>
                <td>{new Date(e.timestamp).toLocaleString()}</td>
                <td>{e.action}</td>
                <td>{e.question || "-"}</td>
                <td>{e.billedCost.toFixed(2)}</td>
                <td>{e.tokenCost.toFixed(2)}</td>
                <td className={net >= 0 ? "positive" : "negative"}>{net.toFixed(2)}</td>
                <td>{e.requests}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <style jsx>{`
        details {
          background: #fff;
          border-radius: 6px;
          padding: 0.5rem;
        }
        summary {
          cursor: pointer;
          font-weight: 600;
          list-style: none;
        }
        .filter {
          margin: 0.5rem 0;
          padding: 0.25rem 0.5rem;
          width: 100%;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th,
        td {
          text-align: left;
          padding: 0.25rem 0.5rem;
        }
        tbody tr:nth-child(odd) {
          background: #f9f9f9;
        }
        .positive {
          color: #237804;
        }
        .negative {
          color: #cf1322;
        }
      `}</style>
    </details>
  );
}

