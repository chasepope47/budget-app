import React from "react";
import FlowSankey from "../components/FlowSankey.jsx";

function monthKeyFromISO(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  if (dateStr.length < 7) return null;
  return dateStr.slice(0, 7);
}

function dollars(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function normalizeDesc(desc = "") {
  let s = String(desc).trim();
  s = s.replace(/[*#]{3,}\w{2,}$/g, "").trim();
  s = s.replace(/\b(?:\d{3,}|x{3,}\d+)\b/gi, "").trim();
  s = s.replace(/\s+/g, " ");
  if (s.length > 28) s = s.slice(0, 26) + "…";
  return s || "Uncategorized";
}

// keyword buckets (tweak as you like)
const FIXED = ["rent", "mortgage", "insurance", "internet", "phone", "utilities", "loan", "payment"];
const ESSENTIAL = ["grocery", "costco", "walmart", "gas", "fuel", "medical", "pharmacy", "power", "water"];
const TRANSFER = ["transfer", "zelle", "venmo", "cash app", "withdrawal", "deposit"];

function bucketFor(label = "") {
  const d = label.toLowerCase();
  if (TRANSFER.some((k) => d.includes(k))) return "Transfers";
  if (FIXED.some((k) => d.includes(k))) return "Fixed";
  if (ESSENTIAL.some((k) => d.includes(k))) return "Essential";
  return "Variable";
}

// fast “top N per bucket”
function topNEntries(map, n) {
  const arr = [];
  for (const entry of map.entries()) {
    arr.push(entry);
    arr.sort((a, b) => b[1] - a[1]);
    if (arr.length > n) arr.length = n;
  }
  return arr;
}

function buildSankey({ accounts = [], monthKey, topNPerBucket = 10, maxRows = 20000 }) {
  const txs = (accounts || []).flatMap((a) => a.transactions || []);

  const scoped = monthKey ? txs.filter((t) => monthKeyFromISO(t.date) === monthKey) : txs;
  const capped = scoped.length > maxRows ? scoped.slice(-maxRows) : scoped;

  const incomeTotal = capped.reduce((s, t) => s + (dollars(t.amount) > 0 ? dollars(t.amount) : 0), 0);

  const bucketTotals = new Map();         // bucket -> total
  const bucketMerchants = new Map();      // bucket -> Map(merchant -> total)

  for (const t of capped) {
    const amt = dollars(t.amount);
    if (!(amt < 0)) continue;

    const merchant = normalizeDesc(t.description || "");
    const bucket = bucketFor(merchant);
    const v = Math.abs(amt);

    bucketTotals.set(bucket, (bucketTotals.get(bucket) || 0) + v);

    if (!bucketMerchants.has(bucket)) bucketMerchants.set(bucket, new Map());
    const m = bucketMerchants.get(bucket);
    m.set(merchant, (m.get(merchant) || 0) + v);
  }

  if (incomeTotal <= 0 && bucketTotals.size === 0) return { nodes: [], links: [], meta: { incomeTotal: 0 } };

  const buckets = ["Fixed", "Essential", "Variable", "Transfers"];

  const nodes = [{ name: "Income" }, ...buckets.map((b) => ({ name: b }))];
  const links = [];

  // Income -> bucket
  for (const b of buckets) {
    const v = bucketTotals.get(b) || 0;
    if (v > 0) links.push({ source: "Income", target: b, value: v });
  }

  // bucket -> top merchants
  for (const b of buckets) {
    const m = bucketMerchants.get(b);
    if (!m) continue;

    for (const [merchant, v] of topNEntries(m, topNPerBucket)) {
      nodes.push({ name: merchant });
      links.push({ source: b, target: merchant, value: v });
    }
  }

  // Leftover
  const spent = buckets.reduce((s, b) => s + (bucketTotals.get(b) || 0), 0);
  const leftover = Math.max(0, incomeTotal - spent);
  if (leftover > 0) {
    nodes.push({ name: "Leftover" });
    links.push({ source: "Income", target: "Leftover", value: leftover });
  }

  // de-dupe nodes
  const seen = new Set();
  const uniqueNodes = [];
  for (const n of nodes) {
    if (seen.has(n.name)) continue;
    seen.add(n.name);
    uniqueNodes.push(n);
  }

  return { nodes: uniqueNodes, links, meta: { incomeTotal } };
}

export default function ReportsPage({ accounts = [], monthKey, onMerchantPick }) {
  const [data, setData] = React.useState({ nodes: [], links: [], meta: { incomeTotal: 0 } });

  React.useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      const next = buildSankey({ accounts, monthKey, topNPerBucket: 10, maxRows: 20000 });
      if (!cancelled) setData(next);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [accounts, monthKey]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="min-h-[560px]">
          <FlowSankey
            data={data}
            height={560}
            onNodeClick={(name, node) => {
              // only treat right-side nodes (merchants) as clickable
              const isBucket = ["Income", "Fixed", "Essential", "Variable", "Transfers", "Leftover"].includes(name);
              if (!isBucket && typeof onMerchantPick === "function") onMerchantPick(name);
            }}
          />
        </div>
      </div>
    </div>
  );
}
