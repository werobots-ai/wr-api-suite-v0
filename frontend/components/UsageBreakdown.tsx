import { useState } from "react";

import type { UsageEntry } from "@/types/account";

function resolveOrigin(entry: UsageEntry): string {
  const metadata = entry.metadata ?? {};
  const source = typeof (metadata as { source?: unknown }).source === "string"
    ? (metadata as { source?: string }).source
    : null;
  if (source === "ui") {
    const email =
      typeof (metadata as { userEmail?: unknown }).userEmail === "string"
        ? (metadata as { userEmail?: string }).userEmail
        : null;
    const userId =
      typeof (metadata as { userId?: unknown }).userId === "string"
        ? (metadata as { userId?: string }).userId
        : null;
    return email || userId || "UI session";
  }
  if (source === "api") {
    const keyId =
      typeof (metadata as { keyId?: unknown }).keyId === "string"
        ? (metadata as { keyId?: string }).keyId
        : null;
    const keySetId =
      typeof (metadata as { keySetId?: unknown }).keySetId === "string"
        ? (metadata as { keySetId?: string }).keySetId
        : null;
    if (keyId) return `API key ${keyId}`;
    if (keySetId) return `API key set ${keySetId}`;
    return "API";
  }
  if (source) {
    return source;
  }
  return "organization";
}

export default function UsageBreakdown({
  entries,
  showCostColumns = true,
  summaryLabel = "Usage Events",
  showOriginColumn = true,
}: {
  entries: UsageEntry[];
  showCostColumns?: boolean;
  summaryLabel?: string;
  showOriginColumn?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const filtered = entries.filter(
    (e) => {
      const origin = resolveOrigin(e);
      return (
        e.action.toLowerCase().includes(filter.toLowerCase()) ||
        (e.question || "").toLowerCase().includes(filter.toLowerCase()) ||
        origin.toLowerCase().includes(filter.toLowerCase())
      );
    },
  );
  return (
    <details>
      <summary>
        {summaryLabel} ({entries.length})
      </summary>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by action, origin, or question"
        className="filter"
      />
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            {showOriginColumn && <th>Origin</th>}
            <th>Question</th>
            <th>Billed ($)</th>
            {showCostColumns && <th>OpenAI ($)</th>}
            {showCostColumns && <th>Net ($)</th>}
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e, i) => {
            const net =
              showCostColumns && e.tokenCost !== null ? e.billedCost - e.tokenCost : null;
            const origin = resolveOrigin(e);
            return (
              <tr key={i}>
                <td>{new Date(e.timestamp).toLocaleString()}</td>
                <td>{e.action}</td>
                {showOriginColumn && <td>{origin}</td>}
                <td>{e.question || "-"}</td>
                <td title={`$${e.billedCost}`}>{e.billedCost.toFixed(2)}</td>
                {showCostColumns && (
                  <td title={e.tokenCost !== null ? `$${e.tokenCost}` : undefined}>
                    {e.tokenCost !== null ? e.tokenCost.toFixed(4) : "—"}
                  </td>
                )}
                {showCostColumns && (
                  <td
                    className={
                      net !== null
                        ? net >= 0
                          ? "positive"
                          : "negative"
                        : undefined
                    }
                    title={net !== null ? `$${net}` : undefined}
                  >
                    {net !== null ? net.toFixed(4) : "—"}
                  </td>
                )}
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

