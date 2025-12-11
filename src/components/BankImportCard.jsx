import React from "react";
import { parseCsvTransactions } from "../lib/csv.js";

function BankImportCard({ onTransactionsParsed = () => {} }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Reading file...");
    setError(null);

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const text = evt.target?.result || "";
        const rows = parseCsvTransactions(text);

        if (!rows.length) {
          setError("No valid rows with amounts were found in this file.");
          setStatus(null);
          return;
        }

        // ✅ We now send an object payload to the parent:
        // { rows, sourceName }
        onTransactionsParsed({
          rows, sourceName: file.name || "",
        });

        setStatus(`Imported ${rows.length} transactions from ${file.name}.`);
      } catch (err) {
        console.error("CSV parse error:", err);
        setError("We couldn't understand this CSV. Try a different export format.");
        setStatus(null);
      }
    };

    reader.onerror = () => {
      setError("Could not read the file.");
      setStatus(null);
    };

    reader.readAsText(file);
  }

  return (
    <div className="space-y-3 text-xs">
      <p className="text-slate-400">
        Upload a <span className="font-mono text-slate-200">.csv</span> bank
        statement. We'll try to detect date, description, and amount.
      </p>

      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-cyan-500/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer transition">
        <span>Choose CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {status && <p className="text-emerald-300">{status}</p>}
      {error && <p className="text-rose-300">{error}</p>}

      <p className="text-[0.7rem] text-slate-500">
        Tip: Most banks let you export recent transactions as CSV from their
        website.
      </p>
    </div>
  );
}

export default BankImportCard;
