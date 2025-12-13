import React from "react";
import FlowSankey from "../components/FlowSankey.jsx";
import {
  fetchReportSettings,
  saveReportSettings,
  DEFAULT_REPORT_SETTINGS,
} from "../api/reportSettingsApi.js";
import { supabase } from "../supabaseClient";

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

  const bucketTotals = new Map();
  const bucketMerchants = new Map();

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

  const spent = buckets.reduce((s, b) => s + (bucketTotals.get(b) || 0), 0);
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

  return { nodes: uniqueNodes, links, meta: { incomeTotal } };
}

const DEFAULT_SETTINGS = DEFAULT_REPORT_SETTINGS;

const PRESETS = {
  Minimal: { topNPerBucket: 6, maxRows: 15000, includeTransfers: false, preset: "Minimal" },
  Detailed: { topNPerBucket: 14, maxRows: 60000, includeTransfers: true, preset: "Detailed" },
  Audit: { topNPerBucket: 25, maxRows: 200000, includeTransfers: true, preset: "Audit" },
};

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function ReportsPage({ accounts = [], monthKey, onMerchantPick }) {
  const [tab, setTab] = React.useState("overview"); // "overview" | "settings"
  const [data, setData] = React.useState({ nodes: [], links: [], meta: { incomeTotal: 0 } });

  const [settings, setSettings] = React.useState(DEFAULT_SETTINGS);
  const [settingsStatus, setSettingsStatus] = React.useState({ loading: true, saving: false, error: null });

  const [userId, setUserId] = React.useState(null);

  // Get current user (works even if you don't have your auth hook imported here)
  React.useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserId(data?.user?.id || null);
    })();

    return () => { mounted = false; };
  }, []);

  // Load settings from Supabase
  React.useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setSettingsStatus((s) => ({ ...s, loading: false }));
      return;
    }

    (async () => {
      try {
        setSettingsStatus({ loading: true, saving: false, error: null });
        const remote = await fetchReportSettings(userId);
        if (cancelled) return;

        if (remote) {
          // merge with defaults to avoid missing fields
          setSettings({ ...DEFAULT_SETTINGS, ...remote });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }

        setSettingsStatus({ loading: false, saving: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setSettingsStatus({ loading: false, saving: false, error: e?.message || "Failed to load settings" });
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // Build sankey when inputs change
  React.useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      const next = buildSankey({
        accounts,
        monthKey,
        topNPerBucket: settings.topNPerBucket,
        maxRows: settings.maxRows,
        includeTransfers: settings.includeTransfers,
      });
      if (!cancelled) setData(next);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [accounts, monthKey, settings.topNPerBucket, settings.maxRows, settings.includeTransfers]);

  // Debounced save to Supabase whenever settings change
  React.useEffect(() => {
    if (!userId) return;
    if (settingsStatus.loading) return;

    const t = setTimeout(async () => {
      try {
        setSettingsStatus((s) => ({ ...s, saving: true, error: null }));
        await saveReportSettings(userId, settings);
        setSettingsStatus((s) => ({ ...s, saving: false }));
      } catch (e) {
        setSettingsStatus((s) => ({ ...s, saving: false, error: e?.message || "Failed to save settings" }));
      }
    }, 600);

    return () => clearTimeout(t);
  }, [userId, settings, settingsStatus.loading]);

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    setSettings((s) => ({ ...s, ...p }));
  }

  return (
    <div className="space-y-3">
      {/* Tabs + status */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/40 p-1">
          <button
            onClick={() => setTab("overview")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              tab === "overview"
                ? "bg-slate-900 text-slate-100"
                : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              tab === "settings"
                ? "bg-slate-900 text-slate-100"
                : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Settings
          </button>
        </div>

        <div className="text-xs text-slate-400">
          {settingsStatus.loading && "Loading settings…"}
          {!settingsStatus.loading && settingsStatus.saving && "Saving…"}
          {!settingsStatus.loading && !settingsStatus.saving && settings.preset && `Preset: ${settings.preset}`}
          {settingsStatus.error ? ` • ${settingsStatus.error}` : ""}
        </div>
      </div>

      {tab === "overview" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
          <div className="min-h-[560px]">
            <FlowSankey
              data={data}
              height={560}
              onNodeClick={(name) => {
                const isBucket = ["Income", "Fixed", "Essential", "Variable", "Transfers", "Leftover"].includes(name);
                if (!isBucket && typeof onMerchantPick === "function") onMerchantPick(name);
              }}
            />
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-5">
          {/* Presets */}
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
                onClick={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, preset: "Custom" }))}
                className="text-sm px-3 py-2 rounded-md border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100"
              >
                Reset
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Presets change chart density/performance. You can still fine-tune below.
            </p>
          </div>

          {/* Controls */}
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
              <p className="text-xs text-slate-400">Higher = more nodes/links.</p>
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
              <p className="text-xs text-slate-400">Performance cap for huge CSV imports.</p>
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

          {!userId && (
            <div className="text-xs text-amber-300">
              Not signed in — settings will not persist across devices.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
