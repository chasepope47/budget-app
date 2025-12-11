// src/components/BankImportCard.jsx
import React from "react";
import {
  parseCsvTransactions,
  parseCsvWithMapping,
  getCsvColumnsForMapping,
  detectBankFromText,
} from "../lib/csv.js";

function BankImportCard({ onTransactionsParsed = () => {} }) {
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [detectedBank, setDetectedBank] = React.useState("");
  const [rawText, setRawText] = React.useState("");
  const [columns, setColumns] = React.useState([]);
  const [mapping, setMapping] = React.useState({
    date: "",
    description: "",
    amount: "",
  });
  const [previewRows, setPreviewRows] = React.useState([]);

  function resetState() {
    setStatus("");
    setError("");
    setRawText("");
    setColumns([]);
    setMapping({ date: "", description: "", amount: "" });
    setPreviewRows([]);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    resetState();
    setFileName(file.name);
    setStatus("Reading file...");
    setError("");

    const lower = (file.name || "").toLowerCase();

    // PDF guard – we don't process PDFs yet
    if (lower.endsWith(".pdf")) {
      setStatus("");
      setError(
        "PDF statements aren't supported yet. Export a CSV from your bank's website and upload that instead."
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const text = String(evt.target?.result || "");
        setRawText(text);

        const bank = detectBankFromText(text, file.name || "");
        if (bank) {
          setDetectedBank(bank);
        } else {
          setDetectedBank("");
        }

        const autoRows = parseCsvTransactions(text);

        setColumns(getCsvColumnsForMapping(text));

        if (!autoRows.length) {
          setPreviewRows([]);
          setStatus(
            "We couldn't automatically detect the right columns. Use the mapping controls below and click Re-parse."
          );
          return;
        }

        setPreviewRows(autoRows);
        setStatus(
          `Parsed ${autoRows.length} transactions. Review the preview below, tweak the mapping if needed, then import.`
        );
      } catch (err) {
        console.error("CSV parse error:", err);
        setError("We couldn't understand this CSV. Try a different export format.");
        setStatus("");
      }
    };

    reader.onerror = () => {
      setError("Could not read the file.");
      setStatus("");
    };

    reader.readAsText(file);
  }

  function handleApplyMapping() {
    if (!rawText) return;

    const config = {
      dateIndex:
        mapping.date === "" ? null : Number.parseInt(mapping.date, 10),
      descIndex:
        mapping.description === ""
          ? null
          : Number.parseInt(mapping.description, 10),
      amountIndex:
        mapping.amount === ""
          ? null
          : Number.parseInt(mapping.amount, 10),
    };

    const rows = parseCsvWithMapping(rawText, config);

    if (!rows.length) {
      setError(
        "No rows were parsed with that mapping. Try different columns or reset to auto-detect."
      );
      setPreviewRows([]);
      setStatus("");
      return;
    }

    setError("");
    setPreviewRows(rows);
    setStatus(
      `Parsed ${rows.length} transactions with your custom mapping. Review the preview, then import.`
    );
  }

  function handleConfirmImport() {
  if (!previewRows.length) return;

  // Send rows up to App so they get routed into the correct account
  onTransactionsParsed({
    rows: previewRows,
    sourceName: fileName || "",
  });

  // Show a simple success message
  setStatus(
    `Imported ${previewRows.length} transactions${
      fileName ? ` from ${fileName}` : ""
    }. View them under the target account.`
  );

  // 🔽 Clear the preview + mapping so they only see transactions in the account pages
  setPreviewRows([]);
  setRawText("");
  setColumns([]);
  setMapping({ date: "", description: "", amount: "" });
}

  const previewCount = Math.min(10, previewRows.length);
  const previewTotal = previewRows.reduce(
    (sum, tx) =>
      sum + (typeof tx.amount === "number" ? tx.amount : 0),
    0
  );

  return (
    <div className="space-y-2 text-xs">
      <p className="text-slate-400">
        Upload a{" "}
        <span className="text-cyan-300 font-semibold">.csv</span> bank
        statement. We&apos;ll parse basic fields like date, description,
        and amount, then route it into the right account.
      </p>

      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer transition">
        <span>Choose CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {fileName && (
        <p className="text-[0.7rem] text-slate-500">
          Selected: <span className="text-slate-300">{fileName}</span>
        </p>
      )}

      {detectedBank && (
        <p className="text-[0.7rem] text-slate-400">
          Detected bank format:{" "}
          <span className="text-cyan-300 font-semibold">
            {detectedBank}
          </span>
        </p>
      )}

      {status && (
        <p className="text-[0.7rem] text-slate-400">{status}</p>
      )}

      {error && (
        <p className="text-[0.7rem] text-rose-400">{error}</p>
      )}

      {/* Column mapping override */}
      {rawText && columns.length > 0 && (
        <div className="mt-2 border border-slate-700 rounded-md p-2 space-y-2">
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
                  value={mapping[fieldKey] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [fieldKey]: e.target.value,
                    }))
                  }
                >
                  <option value="">Auto detect</option>
                  {columns.map((label, idx) => (
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
        </div>
      )}

      {/* Preview table BEFORE import */}
      {previewRows.length > 0 && (
        <div className="mt-2 border border-slate-700 rounded-md p-2 space-y-2">
          <div className="flex items-center justify-between text-[0.7rem] text-slate-400">
            <span>
              Previewing {previewCount} of {previewRows.length} rows
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
                {previewRows.slice(0, previewCount).map((tx, idx) => (
                  <tr key={idx} className="border-b border-slate-800/60">
                    <td className="py-1 pr-2 text-slate-200">
                      {tx.date}
                    </td>
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

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={handleConfirmImport}
              className="px-3 py-1.5 text-[0.7rem] rounded-md border border-emerald-400/70 text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
            >
              Import these transactions
            </button>
            <button
              type="button"
              onClick={resetState}
              className="px-3 py-1.5 text-[0.7rem] rounded-md border border-slate-600 text-slate-200 hover:border-slate-400 transition"
            >
              Discard preview
            </button>
          </div>
        </div>
      )}

      <p className="text-[0.7rem] text-slate-500">
        Tip: Most banks let you export recent transactions as CSV from
        their website.
      </p>
    </div>
  );
}

export default BankImportCard;
