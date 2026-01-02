// src/components/BankImportCard.jsx
import React from "react";
import {
  parseCsvTransactions,
  parseCsvWithMapping,
  getCsvColumnsForMapping,
  detectBankFromText,
} from "../lib/csv.js";

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => resolve(String(evt.target?.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `f-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileKind(file) {
  const lower = (file?.name || "").toLowerCase();
  if (lower.endsWith(".pdf") || file?.type === "application/pdf") return "pdf";
  return "csv";
}

function makeItem(file) {
  return {
    id: makeId(),
    file,
    name: file?.name || "unknown",
    kind: fileKind(file), // csv | pdf
    detectedBank: "",
    rawText: "",
    columns: [],
    // mapping stores indices as strings ("" means auto)
    mapping: { date: "", description: "", amount: "" },
    previewRows: [],
    status: "pending", // pending | parsing | needsMapping | ready | importing | imported | error
    error: "",
    importedCount: 0,
    createdAt: Date.now(),
  };
}

/**
 * Best-effort mapping inference from column labels.
 * Returns indices (as numbers) or null.
 */
function inferMappingFromColumns(columns = []) {
  const norm = (s) => String(s || "").trim().toLowerCase();

  const dateHints = ["date", "posting date", "posted date", "transaction date", "trans date"];
  const descHints = ["description", "desc", "merchant", "name", "memo", "details", "payee"];
  const amtHints = ["amount", "amt", "value", "total"];
  const debitHints = ["debit", "withdrawal", "outflow", "charge", "money out"];
  const creditHints = ["credit", "deposit", "inflow", "payment", "money in"];

  const score = (label, hints) => {
    const l = norm(label);
    if (!l) return 0;
    let s = 0;
    for (const h of hints) {
      if (l === h) s += 10;
      else if (l.includes(h)) s += 6;
    }
    return s;
  };

  const bestIndex = (hints) => {
    let best = { idx: null, s: 0 };
    for (let i = 0; i < columns.length; i++) {
      const s = score(columns[i], hints);
      if (s > best.s) best = { idx: i, s };
    }
    return best.s > 0 ? best.idx : null;
  };

  const dateIdx = bestIndex(dateHints);
  const descIdx = bestIndex(descHints);

  // Prefer "Amount" if present.
  let amtIdx = bestIndex(amtHints);

  // If no amount, but debit/credit exist, choose one (user can override).
  if (amtIdx == null) {
    const debitIdx = bestIndex(debitHints);
    const creditIdx = bestIndex(creditHints);
    if (debitIdx != null && creditIdx == null) amtIdx = debitIdx;
    if (creditIdx != null && debitIdx == null) amtIdx = creditIdx;
    if (debitIdx != null && creditIdx != null) amtIdx = creditIdx;
  }

  return {
    date: dateIdx,
    description: descIdx,
    amount: amtIdx,
  };
}

/**
 * Hands-off CSV parsing:
 * 1) try parseCsvTransactions (your smart header-based parser)
 * 2) if empty, infer mapping from header labels and try parseCsvWithMapping
 * 3) if user manually selected mapping, use that and try parseCsvWithMapping
 */
function parseCsvSmart(text, columns, currentMapping) {
  const hasExplicit =
    currentMapping &&
    (currentMapping.date !== "" || currentMapping.description !== "" || currentMapping.amount !== "");

  const toConfig = (m) => ({
    dateIndex: m?.date === "" ? null : Number.parseInt(m.date, 10),
    descIndex: m?.description === "" ? null : Number.parseInt(m.description, 10),
    amountIndex: m?.amount === "" ? null : Number.parseInt(m.amount, 10),
  });

  // 1) existing robust parser first
  const autoRows = parseCsvTransactions(text);
  if (Array.isArray(autoRows) && autoRows.length) {
    return {
      rows: autoRows,
      status: "ready",
      error: "",
      nextMapping: currentMapping,
      reason: "auto",
    };
  }

  // 2) user mapping
  if (hasExplicit) {
    const rows = parseCsvWithMapping(text, toConfig(currentMapping));
    if (Array.isArray(rows) && rows.length) {
      return {
        rows,
        status: "ready",
        error: "",
        nextMapping: currentMapping,
        reason: "manual",
      };
    }
    return {
      rows: [],
      status: "needsMapping",
      error: "No rows were parsed with that mapping. Try different columns.",
      nextMapping: currentMapping,
      reason: "manual-failed",
    };
  }

  // 3) inferred mapping from header labels
  const inferred = inferMappingFromColumns(columns);
  const inferredMapping = {
    date: inferred.date == null ? "" : String(inferred.date),
    description: inferred.description == null ? "" : String(inferred.description),
    amount: inferred.amount == null ? "" : String(inferred.amount),
  };

  const cfg = toConfig(inferredMapping);
  const enough = cfg.dateIndex != null && cfg.descIndex != null && cfg.amountIndex != null;

  if (enough) {
    const rows = parseCsvWithMapping(text, cfg);
    if (Array.isArray(rows) && rows.length) {
      return {
        rows,
        status: "ready",
        error: "",
        nextMapping: inferredMapping,
        reason: "inferred",
      };
    }
  }

  return {
    rows: [],
    status: "needsMapping",
    error:
      "We couldn't automatically detect the right columns. Pick Date/Description/Amount below — it will re-parse automatically.",
    nextMapping: inferredMapping,
    reason: "inferred-failed",
  };
}

export default function BankImportCard({ onTransactionsParsed = () => {} }) {
  const [items, setItems] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // Keep a ref to latest items so async parseItem can read current state safely
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const active = React.useMemo(
    () => items.find((x) => x.id === activeId) || null,
    [items, activeId]
  );

  const importedCount = items.filter((x) => x.status === "imported").length;
  const readyCount = items.filter((x) => x.status === "ready").length;
  const errorCount = items.filter((x) => x.status === "error").length;

  function addFiles(files = []) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    const next = list.map(makeItem);

    setItems((prev) => {
      const seen = new Set(
        prev.map((p) => `${p.name}::${p.file?.size}::${p.file?.lastModified}`)
      );
      const filtered = next.filter((n) => {
        const key = `${n.name}::${n.file?.size}::${n.file?.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...prev, ...filtered];
    });

    setActiveId((curr) => curr || next[0].id);
  }

  async function parseItem(itemId) {
    setItems((prev) =>
      prev.map((x) => (x.id === itemId ? { ...x, status: "parsing", error: "" } : x))
    );

    const item = itemsRef.current.find((x) => x.id === itemId);
    if (!item) return;

    try {
      if (item.kind === "pdf") {
        const { parsePdfTransactions } = await import("../lib/pdf.js");
        const { text, rows } = await parsePdfTransactions(item.file);

        const bank = detectBankFromText(text, item.name || "");
        const parsedRows = Array.isArray(rows) ? rows : [];

        setItems((prev) =>
          prev.map((x) => {
            if (x.id !== itemId) return x;

            if (!parsedRows.length) {
              return {
                ...x,
                rawText: text || "",
                detectedBank: bank || "",
                previewRows: [],
                columns: [],
                status: "error",
                error: "We couldn't detect any transactions in that PDF. Try CSV instead.",
              };
            }

            return {
              ...x,
              rawText: text || "",
              detectedBank: bank || "",
              previewRows: parsedRows,
              columns: [],
              status: "ready",
              error: "",
            };
          })
        );
        return;
      }

      // CSV
      const text = await readFileAsText(item.file);
      const bank = detectBankFromText(text, item.name || "");
      const cols = getCsvColumnsForMapping(text);

      const result = parseCsvSmart(text, cols, item.mapping);

      setItems((prev) =>
        prev.map((x) => {
          if (x.id !== itemId) return x;
          return {
            ...x,
            rawText: text,
            detectedBank: bank || "",
            columns: cols,
            mapping: result.nextMapping ?? x.mapping,
            previewRows: result.rows,
            status: result.status,
            error: result.error || "",
          };
        })
      );
    } catch (err) {
      console.error("Parse error:", err);
      setItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: "error",
                error:
                  x.kind === "pdf"
                    ? "We couldn't read this PDF. Try downloading it as CSV."
                    : "We couldn't understand this CSV. Try a different export format.",
              }
            : x
        )
      );
    }
  }

  // Auto-parse newly added items (one-by-one)
  React.useEffect(() => {
    const pending = items.find((x) => x.status === "pending");
    if (!pending) return;

    const t = setTimeout(() => parseItem(pending.id), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Debounce auto-reparse when user changes mapping quickly
  const reparseTimerRef = React.useRef(null);

  function updateActiveMapping(fieldKey, value) {
    if (!active) return;

    setItems((prev) =>
      prev.map((x) =>
        x.id === active.id
          ? {
              ...x,
              mapping: { ...x.mapping, [fieldKey]: value },
              status: x.kind === "csv" ? "parsing" : x.status,
              error: "",
            }
          : x
      )
    );

    if (reparseTimerRef.current) clearTimeout(reparseTimerRef.current);

    reparseTimerRef.current = setTimeout(() => {
      const latest = itemsRef.current.find((x) => x.id === active.id);
      if (!latest) return;
      if (latest.kind !== "csv") return;
      if (!latest.rawText) return;

      const cols = latest.columns || [];
      const result = parseCsvSmart(latest.rawText, cols, latest.mapping);

      setItems((prev) =>
        prev.map((x) => {
          if (x.id !== latest.id) return x;
          return {
            ...x,
            mapping: result.nextMapping ?? x.mapping,
            previewRows: result.rows,
            status: result.status,
            error: result.error || "",
          };
        })
      );
    }, 120);
  }

  // awaitable import for "Import all ready"
  function handleImportOne(itemId) {
    return new Promise((resolve) => {
      setItems((prev) => {
        const item = prev.find((x) => x.id === itemId);
        if (!item) return prev;
        if (item.status !== "ready") return prev;

        const next = prev.map((x) => (x.id === itemId ? { ...x, status: "importing" } : x));

        queueMicrotask(() => {
          try {
            onTransactionsParsed(item.previewRows, {
              rawText: item.rawText,
              bank: item.detectedBank || "",
              filename: item.name || "",
              kind: item.kind || "csv",
            });

            setItems((p2) =>
              p2.map((x) =>
                x.id === itemId
                  ? {
                      ...x,
                      status: "imported",
                      importedCount: item.previewRows.length,
                      error: "",
                    }
                  : x
              )
            );
            resolve(true);
          } catch (err) {
            console.error("Import error:", err);
            setItems((p2) =>
              p2.map((x) =>
                x.id === itemId
                  ? {
                      ...x,
                      status: "error",
                      error: err?.message || "Import failed.",
                    }
                  : x
              )
            );
            resolve(false);
          }
        });

        return next;
      });
    });
  }

  async function handleImportAllReady() {
    const ready = itemsRef.current.filter((x) => x.status === "ready");
    for (const it of ready) {
      // eslint-disable-next-line no-await-in-loop
      await handleImportOne(it.id);
    }
  }

  function removeItem(itemId) {
    setItems((prev) => prev.filter((x) => x.id !== itemId));
    if (activeId === itemId) {
      const remaining = itemsRef.current.filter((x) => x.id !== itemId);
      setActiveId(remaining[0]?.id || null);
    }
  }

  function clearAll() {
    if (reparseTimerRef.current) clearTimeout(reparseTimerRef.current);
    setItems([]);
    setActiveId(null);
    setIsDragging(false);
  }

  const previewCount = Math.min(10, active?.previewRows?.length || 0);

  // ✅ Fix: previewTotal should only sum preview rows (not whole file),
  // otherwise huge files show misleading totals.
  const previewTotal = (active?.previewRows || [])
    .slice(0, previewCount)
    .reduce((sum, tx) => sum + (typeof tx.amount === "number" ? tx.amount : 0), 0);

  const showMapping =
    active &&
    active.kind === "csv" &&
    active.rawText &&
    active.columns.length > 0 &&
    (active.status === "needsMapping" || active.error);

  return (
    <div
      className={`space-y-2 text-xs rounded-xl border p-3 transition ${
        isDragging ? "border-cyan-400/70 bg-cyan-500/5" : "border-slate-800 bg-slate-950/30"
      }`}
      onDragEnter={(e) => {
        preventDefaults(e);
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        preventDefaults(e);
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        preventDefaults(e);
        setIsDragging(false);
      }}
      onDrop={(e) => {
        preventDefaults(e);
        setIsDragging(false);
        addFiles(e.dataTransfer?.files || []);
      }}
    >
      <p className="text-slate-400">
        Upload <span className="text-cyan-300 font-semibold">.csv</span> or{" "}
        <span className="text-cyan-300 font-semibold">.pdf</span> bank statements.
        Drop multiple files. Most files will auto-parse and be ready with zero extra clicks.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer transition">
          <span>Choose file(s)</span>
          <input
            type="file"
            accept=".csv,.pdf,text/csv,application/pdf,text/plain"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files || []);
              e.target.value = "";
            }}
          />
        </label>

        {items.length > 0 && (
          <>
            <button
              type="button"
              onClick={handleImportAllReady}
              disabled={readyCount === 0}
              className="px-3 py-1.5 rounded-md border border-emerald-400/70 text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Import all ready ({readyCount})
            </button>

            <button
              type="button"
              onClick={clearAll}
              className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 hover:border-slate-400 transition"
            >
              Clear
            </button>

            <div className="text-[0.7rem] text-slate-500">
              Imported <span className="text-slate-200 font-mono">{importedCount}</span>/
              <span className="text-slate-200 font-mono">{items.length}</span>
              {errorCount ? (
                <span className="ml-2 text-rose-400">
                  ({errorCount} error{errorCount === 1 ? "" : "s"})
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* File queue */}
      {items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((f) => {
              const isActive = f.id === activeId;
              const badge =
                f.status === "imported"
                  ? "text-emerald-300"
                  : f.status === "ready"
                  ? "text-cyan-300"
                  : f.status === "error"
                  ? "text-rose-400"
                  : f.status === "needsMapping"
                  ? "text-amber-300"
                  : f.status === "parsing"
                  ? "text-slate-300"
                  : "text-slate-400";

              return (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-[0.7rem] whitespace-nowrap ${
                    isActive
                      ? "border-cyan-400/70 bg-cyan-500/10 text-cyan-200"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <button type="button" onClick={() => setActiveId(f.id)}>
                    {f.name}
                    <span className={`ml-2 ${badge}`}>• {f.status}</span>
                  </button>

                  <button
                    type="button"
                    className="ml-1 text-slate-500 hover:text-slate-200"
                    title="Remove"
                    onClick={() => removeItem(f.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* Active file details */}
      {active && (
        <div className="mt-1 space-y-2">
          <div className="rounded-md border border-slate-800 bg-black/20 p-2 text-[0.7rem] text-slate-400">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <span className="text-slate-200 font-semibold">{active.name}</span>{" "}
                <span className="text-slate-500">({active.kind.toUpperCase()})</span>
              </div>
              <div className="text-slate-500">
                Rows:{" "}
                <span className="text-slate-200 font-mono">{active.previewRows?.length || 0}</span>
                {active.detectedBank ? (
                  <>
                    {" "}
                    • Bank:{" "}
                    <span className="text-cyan-300 font-semibold">{active.detectedBank}</span>
                  </>
                ) : null}
              </div>
            </div>

            {active.error ? <div className="mt-1 text-rose-400">{active.error}</div> : null}
          </div>

          {/* Mapping override (CSV only) */}
          {showMapping && (
            <div className="border border-slate-700 rounded-md p-2 space-y-2">
              <p className="text-[0.7rem] text-slate-400">
                Quick fix: choose the correct columns below — it will re-parse automatically.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {["date", "description", "amount"].map((fieldKey) => (
                  <label key={fieldKey} className="flex flex-col gap-1 text-[0.7rem]">
                    <span className="uppercase tracking-[0.16em] text-slate-500">{fieldKey}</span>
                    <select
                      className="bg-[#05060F] border border-slate-700 rounded px-2 py-1 text-slate-200"
                      value={active.mapping?.[fieldKey] ?? ""}
                      onChange={(e) => updateActiveMapping(fieldKey, e.target.value)}
                    >
                      <option value="">Auto detect</option>
                      {active.columns.map((label, idx) => (
                        <option key={idx} value={idx}>
                          {label} (column {idx + 1})
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {active.status === "needsMapping" ? (
                <p className="text-[0.7rem] text-amber-300">
                  Pick Date/Description/Amount and it should become “ready”.
                </p>
              ) : null}
            </div>
          )}

          {/* Preview table */}
          {active.previewRows?.length > 0 && (
            <div className="border border-slate-700 rounded-md p-2 space-y-2">
              <div className="flex items-center justify-between text-[0.7rem] text-slate-400">
                <span>
                  Previewing {previewCount} of {active.previewRows.length} rows
                </span>
                <span>
                  Net amount (preview):{" "}
                  <span className={previewTotal < 0 ? "text-rose-300" : "text-emerald-300"}>
                    {previewTotal < 0 ? "-" : ""}${Math.abs(previewTotal).toFixed(2)}
                  </span>
                </span>
              </div>

              <div className="max-h-40 overflow-auto text-[0.7rem]">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#05060F]">
                    <tr className="border-b border-slate-700">
                      <th className="py-1 pr-2 font-semibold text-slate-300">Date</th>
                      <th className="py-1 pr-2 font-semibold text-slate-300">Description</th>
                      <th className="py-1 text-right font-semibold text-slate-300">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.previewRows.slice(0, previewCount).map((tx, idx) => (
                      <tr key={idx} className="border-b border-slate-800/60">
                        <td className="py-1 pr-2 text-slate-200">{tx.date}</td>
                        <td className="py-1 pr-2 text-slate-300">{tx.description}</td>
                        <td
                          className={`py-1 text-right ${
                            tx.amount < 0 ? "text-rose-300" : "text-emerald-300"
                          }`}
                        >
                          {tx.amount < 0 ? "-" : ""}${Math.abs(tx.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => handleImportOne(active.id)}
                  disabled={active.status !== "ready"}
                  className="px-3 py-1.5 text-[0.7rem] rounded-md border border-emerald-400/70 text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import this file
                </button>

                <button
                  type="button"
                  onClick={() => parseItem(active.id)}
                  className="px-3 py-1.5 text-[0.7rem] rounded-md border border-slate-600 text-slate-200 hover:border-slate-400 transition"
                >
                  Re-parse
                </button>
              </div>
            </div>
          )}

          {active.previewRows?.length === 0 && active.status === "ready" ? (
            <p className="text-[0.7rem] text-slate-500">
              No rows to preview. If this seems wrong, try re-parsing.
            </p>
          ) : null}
        </div>
      )}

      <p className="text-[0.7rem] text-slate-500">
        Tip: Most banks let you export recent transactions as CSV from their website.
      </p>
    </div>
  );
}
