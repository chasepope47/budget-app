// src/lib/csv.js

// --- Known banks for account detection ---
export const KNOWN_BANKS = [
  { key: "chase", label: "Chase" },
  { key: "capitalone", label: "Capital One" },
  { key: "wellsfargo", label: "Wells Fargo" },
  { key: "americanexpress", label: "Amex" },
  { key: "discover", label: "Discover" },
  { key: "navyfederal", label: "Navy Federal" },
  { key: "mountainamerica", label: "Mountain America" },
  { key: "bankofamerica", label: "Bank of America" },
  { key: "usbank", label: "US Bank" },
  { key: "pnc", label: "PNC" },
];

// normalize a string for matching (file names, descriptions, etc)
export function normalizeKey(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// super-simple CSV splitter that respects quotes
export function splitCsvLine(line) {
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

// parse amounts like "$1,234.56", "(123.45)", etc.
export function parseAmountCell(cell) {
  if (cell === null || cell === undefined) return NaN;
  let cleaned = String(cell).trim();

  // remove quotes
  cleaned = cleaned.replace(/"/g, "");

  // handle parentheses for negatives: (123.45) => -123.45
  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }

  // strip $ and commas
  cleaned = cleaned.replace(/[$,]/g, "");

  if (cleaned === "") return NaN;

  const num = Number(cleaned);
  if (Number.isNaN(num)) return NaN;
  return negative ? -num : num;
}

// heuristic categorization by description + amount sign
export function categorizeTransaction(description, amount) {
  const text = (description || "").toLowerCase();

  if (amount > 0) {
    if (text.includes("payroll") || text.includes("direct deposit")) {
      return "Income – Paycheck";
    }
    if (text.includes("refund") || text.includes("rebate")) {
      return "Income – Refund";
    }
    return "Income – Other";
  }

  // Money going out
  if (text.includes("uber") || text.includes("lyft") || text.includes("taxi")) {
    return "Transport – Rideshare";
  }
  if (
    text.includes("shell") ||
    text.includes("chevron") ||
    text.includes("exxon") ||
    text.includes("gas") ||
    text.includes("fuel")
  ) {
    return "Transport – Gas";
  }
  if (
    text.includes("walmart") ||
    text.includes("costco") ||
    text.includes("grocery") ||
    text.includes("smith") ||
    text.includes("kroger")
  ) {
    return "Groceries";
  }
  if (
    text.includes("starbucks") ||
    text.includes("coffee") ||
    text.includes("mcdonald") ||
    text.includes("taco bell") ||
    text.includes("restaurant") ||
    text.includes("cafe")
  ) {
    return "Food & Dining";
  }
  if (
    text.includes("netflix") ||
    text.includes("spotify") ||
    text.includes("hulu") ||
    text.includes("disney") ||
    text.includes("subscription") ||
    text.includes("prime")
  ) {
    return "Subscriptions";
  }
  if (
    text.includes("rent") ||
    text.includes("landlord") ||
    text.includes("mortgage")
  ) {
    return "Housing – Rent/Mortgage";
  }
  if (
    text.includes("power") ||
    text.includes("electric") ||
    text.includes("water") ||
    text.includes("utility") ||
    text.includes("utilities")
  ) {
    return "Utilities";
  }
  if (text.includes("gym") || text.includes("fitness")) {
    return "Health & Fitness";
  }
  if (
    text.includes("insurance") ||
    text.includes("geico") ||
    text.includes("allstate")
  ) {
    return "Insurance";
  }
  if (
    text.includes("amazon") ||
    text.includes("target") ||
    text.includes("best buy") ||
    text.includes("shop")
  ) {
    return "Shopping";
  }

  return "Other";
}

// header alias map for flexible CSV formats
export const HEADER_ALIASES = {
  date: [
    "date",
    "transaction date",
    "posted date",
    "posting date",
    "trans date",
  ],
  description: [
    "description",
    "details",
    "memo",
    "payee",
    "transaction description",
    "narrative",
  ],
  debit: ["debit", "withdrawal", "outflow", "money out", "charge"],
  credit: ["credit", "deposit", "inflow", "money in", "payment", "credit amount"],
  amount: ["amount", "amt", "transaction amount", "value"],
};

export function normalizeHeaderRow(line) {
  const parts = splitCsvLine(line).map((h) => h.trim());
  return parts.map((cell) => {
    let h = cell.toLowerCase().replace(/"/g, "");
    h = h.replace(/\s+/g, " ").trim();
    return h;
  });
}

export function findHeaderIndex(header, aliases) {
  return header.findIndex((h) => aliases.includes(h));
}

/**
 * Main CSV → [{ date, description, amount, category }]
 */
export function parseCsvTransactions(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const header = normalizeHeaderRow(lines[0]);

  const dateIndex = findHeaderIndex(header, HEADER_ALIASES.date);
  const descIndex = findHeaderIndex(header, HEADER_ALIASES.description);
  const amountIndex = findHeaderIndex(header, HEADER_ALIASES.amount);
  const debitIndex = findHeaderIndex(header, HEADER_ALIASES.debit);
  const creditIndex = findHeaderIndex(header, HEADER_ALIASES.credit);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = splitCsvLine(raw).map((c) => c.trim());

    if (cols.length === 0 || cols.every((c) => c === "")) continue;

    const date = dateIndex >= 0 ? cols[dateIndex] : "";
    const description = descIndex >= 0 ? cols[descIndex] : "";

    let amount = NaN;

    if (amountIndex >= 0) {
      // Single Amount column
      amount = parseAmountCell(cols[amountIndex]);
    } else if (debitIndex >= 0 || creditIndex >= 0) {
      // Separate Debit/Credit columns
      const debit =
        debitIndex >= 0 ? parseAmountCell(cols[debitIndex]) : 0;
      const credit =
        creditIndex >= 0 ? parseAmountCell(cols[creditIndex]) : 0;

      // Convention: money in = +, money out = -
      amount = credit - debit;
    }

    // Skip totally empty rows
    if (!date && !description && isNaN(amount)) continue;

    // Skip non-numeric amounts
    if (typeof amount !== "number" || Number.isNaN(amount)) continue;

    const category = categorizeTransaction(description, amount);

    rows.push({
      date,
      description,
      amount,
      category,
    });
  }

  return rows;
}
