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

function buildSankey({
  accounts = [],
  monthKey,
  topNPerBucket = 10,
  maxRows = 20000,
  includeTransfers = true,
}) {
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

    if (!includeTransfers && bucket === "Transfers") continue;

    const v = Math.abs(amt);

    bucketTotals.set(bucket, (bucketTotals.get(bucket) || 0) + v);

    if (!bucketMerchants.has(bucket)) bucketMerchants.set(bucket, new Map());
    const m = bucketMerchants.get(bucket);
    m.set(merchant, (m.get(merchant) || 0) + v);
  }

  if (incomeTotal <= 0 && bucketTotals.size === 0) return { nodes: [], links: [], meta: { incomeTotal: 0 } };

  const buckets = includeTransfers
    ? ["Fixed", "Essential", "Variable", "Transfers"]
    : ["Fixed", "Essential", "Variable"];

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

function ReportsSettingsPanel({ open, onClose, settings, onChange }) {
  if (!open) return null;

  const setField = (key, value) => onChange({ ...settings, [key]: value });

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close settings"
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-[92%] max-w-md bg-slate-950 border-l border-slate-800 shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-slate-100 font-semibold">Report Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-100 text-sm px-3 py-1 rounded-md border border-slate-800"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Top N */}
          <div className="space-y-2">
            <label className="text-slate-100 text-sm font-medium">
              Top merchants per bucket
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.topNPerBucket}
              onChange={(e) => setField("topNPerBucket", Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
              className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-slate-100"
            />
            <p className="text-xs text-slate-400">
              Higher = more nodes/links (can get busy).
            </p>
          </div>

          {/* Max Rows */}
          <div className="space-y-2">
            <label className="text-slate-100 text-sm font-medium">
              Max rows to process
            </label>
            <input
              type="number"
              min={1000}
              max={200000}
              step={1000}
              value={settings.maxRows}
              onChange={(e) => {
                const v = Number(e.target.value) || 20000;
                setField("maxRows", Math.max(1000, Math.min(200000, v)));
              }}
              className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-slate-100"
            />
            <p className="text-xs text-slate-400">
              Caps how many transactions are used for the chart.
            </p>
          </div>

          {/* Transfers toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-slate-100 text-sm font-medium">Include Transfers</p>
              <p className="text-slate-400 text-xs">Show/hide “Transfers” bucket.</p>
            </div>
            <input
              type="checkbox"
              checked={!!settings.includeTransfers}
              onChange={(e) => setField("includeTransfers", e.target.checked)}
              className="h-5 w-5"
            />
          </div>

          {/* Reset */}
          <button
            onClick={() =>
              onChange({ topNPerBucket: 10, maxRows: 20000, includeTransfers: true })
            }
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md px-3 py-2 text-slate-100"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage({ accounts = [], monthKey, onMerchantPick }) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [reportSettings, setReportSettings] = React.useState({
    topNPerBucket: 10,
    maxRows: 20000,
    includeTransfers: true,
  });

  const [data, setData] = React.useState({ nodes: [], links: [], meta: { incomeTotal: 0 } });

  React.useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      const next = buildSankey({
        accounts,
        monthKey,
        topNPerBucket: reportSettings.topNPerBucket,
        maxRows: reportSettings.maxRows,
        includeTransfers: reportSettings.includeTransfers,
      });
      if (!cancelled) setData(next);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [accounts, monthKey, reportSettings.topNPerBucket, reportSettings.maxRows, reportSettings.includeTransfers]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-sm px-3 py-2 rounded-md border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100"
        >
          Settings
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="min-h-[560px]">
          <FlowSankey
            data={data}
            height={560}
            onNodeClick={(name, node) => {
              const isBucket = ["Income", "Fixed", "Essential", "Variable", "Transfers", "Leftover"].includes(name);
              if (!isBucket && typeof onMerchantPick === "function") onMerchantPick(name);
            }}
          />
        </div>
      </div>

      <ReportsSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={reportSettings}
        onChange={setReportSettings}
      />
    </div>
  );
}
