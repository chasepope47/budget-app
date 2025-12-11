import React from "react";

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
        const rows = parseCsvToTransactions(text);
        if (!rows.length) {
          setError("No valid rows with amounts were found in this file.");
          setStatus(null);
          return;
        }

        onTransactionsParsed({ rows, sourceName: file.name || "" });
        setStatus(`Imported ${rows.length} transactions.`);
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

/**
 * CSV → { date, description, amount, category }[]
 * (Very similar to what you already had, but trimmed to what BankImportCard uses.)
 */
function parseCsvToTransactions(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return [];

  const headerLine = lines[0];
  const headerCells = splitCsvLine(headerLine).map((h) =>
    h.trim().toLowerCase()
  );

  const findIndex = (candidates) =>
    headerCells.findIndex((h) =>
      candidates.some((c) => h.includes(c.toLowerCase()))
    );

  const dateIdx = findIndex(["date", "posted", "transaction date"]);
  const descIdx = findIndex(["description", "memo", "details", "payee"]);
  const amountIdx = findIndex(["amount", "amt"]);
  const debitIdx = findIndex(["debit", "withdrawal", "charge"]);
  const creditIdx = findIndex(["credit", "deposit", "payment"]);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => !c || !c.trim())) continue;

    const date =
      dateIdx >= 0 && cells[dateIdx] ? cells[dateIdx].trim() : "";

    const description =
      descIdx >= 0 && cells[descIdx]
        ? cells[descIdx].trim()
        : "Transaction";

    let amount = null;

    if (amountIdx >= 0 && cells[amountIdx]) {
      amount = parseAmountCell(cells[amountIdx]);
    } else {
      const debitVal =
        debitIdx >= 0 && cells[debitIdx]
          ? parseAmountCell(cells[debitIdx])
          : null;
      const creditVal =
        creditIdx >= 0 && cells[creditIdx]
          ? parseAmountCell(cells[creditIdx])
          : null;

      if (debitVal !== null && !Number.isNaN(debitVal)) {
        amount = -Math.abs(debitVal);
      } else if (creditVal !== null && !Number.isNaN(creditVal)) {
        amount = Math.abs(creditVal);
      }
    }

    if (typeof amount !== "number" || Number.isNaN(amount)) {
      continue;
    }

    rows.push({
      date,
      description,
      category: "Other",
      amount,
    });
  }

  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseAmountCell(cell) {
  if (cell === null || cell === undefined) return NaN;
  let cleaned = String(cell).trim();

  cleaned = cleaned.replace(/"/g, "");

  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }

  cleaned = cleaned.replace(/[$,]/g, "");

  if (cleaned === "") return NaN;

  const num = Number(cleaned);
  if (Number.isNaN(num)) return NaN;
  return negative ? -num : num;
}

export default BankImportCard;
