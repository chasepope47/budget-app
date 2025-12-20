// src/pages/ReportsPage.jsx
import React from "react";
import FlowSankey from "../components/FlowSankey.jsx";
import {
  DEFAULT_REPORT_SETTINGS,
  fetchReportSettings,
  saveReportSettings,
} from "../api/reportSettingsApi.js"; // keeping your import as-is

function monthKeyFromISO(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  if (dateStr.length < 7) return null;
  return dateStr.slice(0, 7);
}

function dollars(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function normalizeForMatch(desc = "") {
  let s = String(desc).trim().toLowerCase();
  s = s.replace(/\s+/g, " ");
  return s;
}

function normalizeForDisplay(desc = "") {
  let s = String(desc).trim();
  s = s.replace(/[*#]{3,}\w{2,}$/g, "").trim();
  s = s.replace(/\b(?:\d{3,}|x{3,}\d+)\b/gi, "").trim();
  s = s.replace(/\s+/g, " ");
  if (s.length > 28) s = s.slice(0, 26) + "…";
  return s || "Uncategorized";
}

const FIXED = [
  "rent",
  "mortgage",
  "apts",
  "apt",
  "apartment",
  "lease",
  "property management",
  "hoa",
  "insurance",
  "internet",
  "phone",
  "utilities",
  "loan",
  "payment",
];

const SUBSCRIPTIONS = [
  "amazon prime",
  "prime membership",
  "netflix",
  "hulu",
  "spotify",
  "youtube premium",
  "rocket money",
  "membership",
  "subscription",
  "icloud",
  "google one",
  "dropbox",
];

const ESSENTIAL = [
  "grocery",
  "costco",
  "walmart",
  "gas",
  "fuel",
  "medical",
  "pharmacy",
  "power",
  "water",
];

const TRANSFER = ["transfer", "zelle", "venmo", "cash app", "withdrawal", "deposit"];

function bucketFor(matchText = "") {
  const d = matchText.toLowerCase();
  if (TRANSFER.some((k) => d.includes(k))) return "Transfers";
  if (FIXED.some((k) => d.includes(k))) return "Fixed";
  if (SUBSCRIPTIONS.some((k) => d.includes(k))) return "Subscriptions";
  if (ESSENTIAL.some((k) => d.includes(k))) return "Essential";
  return "Variable";
}

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

  const incomeTotal = capped.reduce(
    (s, t) => s + (dollars(t.amount) > 0 ? dollars(t.amount) : 0),
    0
  );

  const bucketTotals = new Map();
  const bucketMerchants = new Map();

  for (const t of capped) {
    const amt = dollars(t.amount);
    if (!(amt < 0)) continue;

    const matchText = normalizeForMatch(t.description || "");
    const merchant = normalizeForDisplay(t.description || "");
    const bucket = bucketFor(matchText);

    if (!includeTransfers && bucket === "Transfers") continue;

    const v = Math.abs(amt);
    bucketTotals.set(bucket, (bucketTotals.get(bucket) || 0) + v);

    if (!bucketMerchants.has(bucket)) bucketMerchants.set(bucket, new Map());
    const m = bucketMerchants.get(bucket);
    m.set(merchant, (m.get(merchant) || 0) + v);
  }

  if (incomeTotal <= 0 && bucketTotals.size === 0) {
    return { nodes: [], links: [], meta: { incomeTotal: 0 } };
  }

  const buckets = includeTransfers
    ? ["Fixed", "Subscriptions", "Essential", "Variable", "Transfers"]
    : ["Fixed", "Subscriptions", "Essential", "Variable"];

  const nodes = [{ name: "Income" }, ...buckets.map((b) => ({ name: b }))];
  const links = [];

  for (const b of buckets) {
    const v = bucketTotals.get(b) || 0;
    if (v > 0) links.push({ source: "Income", target: b, value: v });
  }

  for (const b of buckets) {
    const m = bucketMerchants.get(b);
    if (!m) continue;

    for (const [merchant, v] of topNEntries(m, topNPerBucket)) {
      nodes.push({ name: merchant });
      links.push({ source: b, target: merchant, value: v });
    }
  }

  const spent = buckets.reduce(
    (s, b) => (b === "Transfers" ? s : s + (bucketTotals.get(b) || 0)),
    0
  );
  const leftover = Math.max(0, incomeTotal - spent);

  if (leftover > 0) {
    nodes.push({ name: "Leftover" });
    links.push({ source: "Income", target: "Leftover", value: leftover });
  }

  const seen = new Set();
  const uniqueNodes = [];
  for (const n of nodes) {
    if (seen.has(n.name)) continue;
    seen.add(n.name);
    uniqueNodes.push(n);
  }

  return {
    nodes: uniqueNodes,
    links,
    meta: {
      incomeTotal,
      totalIncome: incomeTotal,
      spentTotal: spent,
      totalSpent: spent,
      transfersTotal: bucketTotals.get("Transfers") || 0,
      leftover,
    },
  };
}

const SETTINGS_KEY = "budgetApp_reportSettings_v1";

const PRESETS = {
  Minimal: { topNPerBucket: 5, maxRows: 10000, includeTransfers: false, preset: "Minimal" },
  Detailed: { topNPerBucket: 12, maxRows: 60000, includeTransfers: true, preset: "Detailed" },
  Audit: { topNPerBucket: 30, maxRows: 200000, includeTransfers: true, preset: "Audit" },
};

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function ReportsPage({ accounts = [], monthKey, onMerchantPick }) {
  const [tab, setTab] = React.useState("overview");
  const [data, setData] = React.useState({ nodes: [], links: [], meta: { incomeTotal: 0 } });

  // ✅ responsive height: smaller on phones, larger on desktop
  const [chartHeight, setChartHeight] = React.useState(560);

  React.useEffect(() => {
    function compute() {
      // clamp-ish: ~380 on small phones, up to 640+ on large screens
      const h = Math.max(380, Math.min(680, Math.round(window.innerHeight * 0.55)));
      setChartHeight(h);
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const [settings, setSettings] = React.useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return { ...DEFAULT_REPORT_SETTINGS, ...(parsed || {}) };
    } catch {
      return { ...DEFAULT_REPORT_SETTINGS };
    }
  });

  React.useEffect(() => {
    const id = setTimeout(() => {
      setData(
        buildSankey({
          accounts,
          monthKey,
          topNPerBucket: settings.topNPerBucket,
          maxRows: settings.maxRows,
          includeTransfers: settings.includeTransfers,
        })
      );
    }, 0);

    return () => clearTimeout(id);
  }, [accounts, monthKey, settings.topNPerBucket, settings.maxRows, settings.includeTransfers]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {}
    }, 300);

    return () => clearTimeout(t);
  }, [settings]);

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    setSettings((s) => ({ ...s, ...p, preset: name }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/40 p-1">
          <button
            onClick={() => setTab("overview")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              tab === "overview" ? "bg-slate-900 text-slate-100" : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              tab === "settings" ? "bg-slate-900 text-slate-100" : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {tab === "overview" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
          {/* ✅ Internal scroll safety net so the chart never forces page-wide overflow */}
          <div className="hScroll">
            <div style={{ minHeight: chartHeight }}>
              <FlowSankey
                data={data}
                height={chartHeight}
                onNodeClick={(name) => {
                  const isBucket = [
                    "Income",
                    "Fixed",
                    "Subscriptions",
                    "Essential",
                    "Variable",
                    "Transfers",
                    "Leftover",
                  ].includes(name);

                  if (!isBucket && typeof onMerchantPick === "function") {
                    onMerchantPick(name);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-5">
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-100">Presets</div>
            <div className="flex flex-wrap gap-2">
              {["Minimal", "Detailed", "Audit"].map((name) => (
                <button
                  key={name}
                  onClick={() => applyPreset(name)}
                  className="text-sm px-3 py-2 rounded-md border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100"
                >
                  {name}
                </button>
              ))}
              <button
                onClick={() => setSettings({ ...DEFAULT_REPORT_SETTINGS, preset: "Custom" })}
                className="text-sm px-3 py-2 rounded-md border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-slate-100 text-sm font-medium">Top merchants per bucket</label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.topNPerBucket}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    topNPerBucket: clampInt(e.target.value, 1, 50, 10),
                    preset: "Custom",
                  }))
                }
                className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-slate-100 text-sm font-medium">Max rows to process</label>
              <input
                type="number"
                min={1000}
                max={200000}
                step={1000}
                value={settings.maxRows}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    maxRows: clampInt(e.target.value, 1000, 200000, 20000),
                    preset: "Custom",
                  }))
                }
                className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between gap-4 md:col-span-2">
              <div>
                <p className="text-slate-100 text-sm font-medium">Include Transfers</p>
                <p className="text-slate-400 text-xs">Show/hide “Transfers” bucket in the chart.</p>
              </div>
              <input
                type="checkbox"
                checked={!!settings.includeTransfers}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    includeTransfers: e.target.checked,
                    preset: "Custom",
                  }))
                }
                className="h-5 w-5"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
