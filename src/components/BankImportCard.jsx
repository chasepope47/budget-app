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
  // crypto.randomUUID is ideal, fallback if not supported
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `f-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileKind(file) {
  const lower = (file?.name || "").toLowerCase();
  if (lower.endsWith(".pdf") || file?.type === "application/pdf") return "pdf";
  return "csv";
}

// A queue item (one per selected file)
function makeItem(file) {
  return {
    id: makeId(),
    file,
    name: file?.name || "unknown",
    kind: fileKind(file), // csv | pdf
    detectedBank: "",
    rawText: "",
    columns: [],
    mapping: { date: "", description: "", amount: "" },
    previewRows: [],
    status: "pending", // pending | parsing | needsMapping | ready | importing | imported | error
    error: "",
    importedCount: 0,
    createdAt: Date.now(),
  };
}

export default function BankImportCard({ onTransactionsParsed = () => {} }) {
  const [items, setItems] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);

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
      // de-dupe by (name + size + lastModified) to avoid accidental duplicates
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

    // set active to first newly added file
    setActiveId((curr) => curr || next[0].id);
  }

  async function parseItem(itemId) {
    // mark parsing
    setItems((prev) =>
      prev.map((x) =>
        x.id === itemId ? { ...x, status: "parsing", error: "" } : x
      )
    );

    const item = items.find((x) => x.id === itemId);
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
                error:
                  "We couldn't detect any transactions in that PDF. Try a different export or use CSV.",
              };
            }
            return {
              ...x,
              rawText: text || "",
              detectedBank: bank || "",
              previewRows: parsedRows,
              columns: [], // mapping not used for PDF right now
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

      const autoRows = parseCsvTransactions(text);
      const cols = getCsvColumnsForMapping(text);

      setItems((prev) =>
        prev.map((x) => {
          if (x.id !== itemId) return x;

          if (!autoRows.length) {
            return {
              ...x,
              rawText: text,
              detectedBank: bank || "",
              columns: cols,
              previewRows: [],
              status: "needsMapping",
              error:
                "We couldn't automatically detect the right columns. Use the mapping controls and click Re-parse.",
            };
          }

          return {
            ...x,
            rawText: text,
            detectedBank: bank || "",
            columns: cols,
            previewRows: autoRows,
            status: "ready",
            error: "",
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
                    ? "We couldn't read this PDF. Try downloading it as a CSV or a different PDF format."
                    : "We couldn't understand this CSV. Try a different export format.",
              }
            : x
        )
      );
    }
  }

  // Auto-parse newly added items (keeps UX smooth)
  React.useEffect(() => {
    // parse any "pending" items one-by-one
    const pending = items.find((x) => x.status === "pending");
    if (!pending) return;

    // Let UI paint first
    const t = setTimeout(() => parseItem(pending.id), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function updateActiveMapping(fieldKey, value) {
    if (!active) return;
    setItems((prev) =>
      prev.map((x) =>
        x.id === active.id
          ? { ...x, mapping: { ...x.mapping, [fieldKey]: value } }
          : x
      )
    );
  }

  function handleApplyMapping() {
    if (!active?.rawText) return;

    const config = {
      dateIndex:
        active.mapping.date === "" ? null : Number.parseInt(active.mapping.date, 10),
      descIndex:
        active.mapping.description === ""
          ? null
          : Number.parseInt(active.mapping.description, 10),
      amountIndex:
        active.mapping.amount === "" ? null : Number.parseInt(active.mapping.amount, 10),
    };

    const rows = parseCsvWithMapping(active.rawText, config);

    if (!rows.length) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === active.id
            ? {
                ...x,
                previewRows: [],
                status: "needsMapping",
                error:
                  "No rows were parsed with that mapping. Try different columns or reset to auto-detect.",
              }
            : x
        )
      );
      return;
    }

    setItems((prev) =>
      prev.map((x) =>
        x.id === active.id
          ? {
              ...x,
              previewRows: rows,
              status: "ready",
              error: "",
            }
          : x
      )
    );
  }

  function handleImportOne(itemId) {
  setItems((prev) => {
    const item = prev.find((x) => x.id === itemId);
    if (!item) return prev;
    if (item.status !== "ready") return prev;

    // mark importing immediately
    const next = prev.map((x) =>
      x.id === itemId ? { ...x, status: "importing" } : x
    );

    // fire import AFTER we have the correct item snapshot
    queueMicrotask(() => {
      try {
        const meta = {
          sourceText: item.rawText,
          detectedBank: item.detectedBank,
          fileName: item.name,
          kind: item.kind, // "csv" | "pdf"
        };

        // 👇 parent should use meta.detectedBank/fileName to create/select an account
        onTransactionsParsed(item.previewRows, {
          detectedBank: item.detectedBank,
          fileName: item.name,
          kind: item.kind,
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
      }
    });

    return next;
  });
}

  async function handleImportAllReady() {
    // sequential import keeps state stable
    const ready = items.filter((x) => x.status === "ready");
    for (const it of ready) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
      handleImportOne(it.id);
    }
  }

  function removeItem(itemId) {
    setItems((prev) => prev.filter((x) => x.id !== itemId));
    if (activeId === itemId) {
      const remaining = items.filter((x) => x.id !== itemId);
      setActiveId(remaining[0]?.id || null);
    }
  }

  function clearAll() {
    setItems([]);
    setActiveId(null);
    setIsDragging(false);
  }

  const previewCount = Math.min(10, active?.previewRows?.length || 0);
  const previewTotal = (active?.previewRows || []).reduce(
    (sum, tx) => sum + (typeof tx.amount === "number" ? tx.amount : 0),
    0
  );

  return (
    <div
      className={`space-y-2 text-xs rounded-xl border p-3 transition ${
        isDragging
          ? "border-cyan-400/70 bg-cyan-500/5"
          : "border-slate-800 bg-slate-950/30"
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
        Upload{" "}
        <span className="text-cyan-300 font-semibold">.csv</span> or{" "}
        <span className="text-cyan-300 font-semibold">.pdf</span> bank statements.
        You can drop multiple files here. Click a file to preview/match columns before importing.
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
              Imported{" "}
              <span className="text-slate-200 font-mono">{importedCount}</span>/
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
                <span className="text-slate-200 font-mono">
                  {active.previewRows?.length || 0}
                </span>
                {active.detectedBank ? (
                  <>
                    {" "}
                    • Bank:{" "}
                    <span className="text-cyan-300 font-semibold">
                      {active.detectedBank}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {active.error ? (
              <div className="mt-1 text-rose-400">{active.error}</div>
            ) : null}
          </div>

          {/* Mapping override (CSV only) */}
          {active.kind === "csv" && active.rawText && active.columns.length > 0 && (
            <div className="border border-slate-700 rounded-md p-2 space-y-2">
              <p className="text-[0.7rem] text-slate-400">
                If dates/amounts look wrong, override the mapping:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {["date", "description", "amount"].map((fieldKey) => (
                  <label
                    key={fieldKey}
                    className="flex flex-col gap-1 text-[0.7rem]"
                  >
                    <span className="uppercase tracking-[0.16em] text-slate-500">
                      {fieldKey}
                    </span>
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

              <button
                type="button"
                onClick={handleApplyMapping}
                className="mt-1 px-3 py-1.5 text-[0.7rem] rounded-md border border-cyan-400/70 text-cyan-100 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
              >
                Re-parse with mapping
              </button>

              {active.status === "needsMapping" ? (
                <p className="text-[0.7rem] text-amber-300">
                  This file needs mapping before it can be imported.
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
                  Net amount:{" "}
                  <span
                    className={
                      previewTotal < 0 ? "text-rose-300" : "text-emerald-300"
                    }
                  >
                    {previewTotal < 0 ? "-" : ""}
                    ${Math.abs(previewTotal).toFixed(2)}
                  </span>
                </span>
              </div>

              <div className="max-h-40 overflow-auto text-[0.7rem]">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#05060F]">
                    <tr className="border-b border-slate-700">
                      <th className="py-1 pr-2 font-semibold text-slate-300">
                        Date
                      </th>
                      <th className="py-1 pr-2 font-semibold text-slate-300">
                        Description
                      </th>
                      <th className="py-1 text-right font-semibold text-slate-300">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.previewRows.slice(0, previewCount).map((tx, idx) => (
                      <tr key={idx} className="border-b border-slate-800/60">
                        <td className="py-1 pr-2 text-slate-200">{tx.date}</td>
                        <td className="py-1 pr-2 text-slate-300">
                          {tx.description}
                        </td>
                        <td
                          className={`py-1 text-right ${
                            tx.amount < 0 ? "text-rose-300" : "text-emerald-300"
                          }`}
                        >
                          {tx.amount < 0 ? "-" : ""}
                          ${Math.abs(tx.amount).toFixed(2)}
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
              No rows to preview. If this seems wrong, try re-parsing or mapping.
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
