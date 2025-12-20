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

/**
 * Try to guess the bank from the file name + first part of the contents.
 */
export function detectBankFromText(text = "", fileName = "") {
  const haystack = normalizeKey((fileName || "") + " " + text.slice(0, 4000));

  for (const bank of KNOWN_BANKS) {
    if (haystack.includes(bank.key)) {
      return bank.label;
    }
  }
  return null;
}

// super-simple CSV splitter that respects quotes
// Detect delimiter by sampling the header line; fallback to comma.
function detectDelimiter(text = "") {
  const firstLine =
    text.split(/\r\n|\n|\r/).find((l) => l.trim().length > 0) || "";

  let comma = 0;
  let semi = 0;
  let tab = 0;
  let pipe = 0;
  let inQuotes = false;

  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ",") comma++;
    else if (ch === ";") semi++;
    else if (ch === "\t") tab++;
    else if (ch === "|") pipe++;
  }

  const counts = [
    { d: ",", c: comma },
    { d: ";", c: semi },
    { d: "\t", c: tab },
    { d: "|", c: pipe },
  ].sort((a, b) => b.c - a.c);

  return counts[0].c > 0 ? counts[0].d : ",";
}

export function splitCsvLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // support escaped quotes by double-double-quote inside quoted field
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === delimiter && !inQuotes) {
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

  // handle trailing CR/DR markers common in some bank exports
  let isCreditMarker = false;
  let isDebitMarker = false;
  if (/[a-z]/i.test(cleaned.slice(-1))) {
    if (cleaned.trim().toUpperCase().endsWith("CR")) {
      isCreditMarker = true;
      cleaned = cleaned.replace(/cr$/i, "");
    } else if (cleaned.trim().toUpperCase().endsWith("DR")) {
      isDebitMarker = true;
      cleaned = cleaned.replace(/dr$/i, "");
    }
  }

  // strip $ and commas
  cleaned = cleaned.replace(/[$,]/g, "");

  // handle trailing/leading + or - indicators (e.g., 123.45-)
  if (cleaned.endsWith("-")) {
    cleaned = "-" + cleaned.slice(0, -1);
  }
  if (cleaned.endsWith("+")) {
    cleaned = cleaned.slice(0, -1);
  }
  // allow trailing/leading plus sign
  cleaned = cleaned.replace(/^\+/, "");

  if (cleaned === "") return NaN;

  const num = Number(cleaned);
  if (Number.isNaN(num)) return NaN;

  let val = negative ? -num : num;
  if (isCreditMarker) val = Math.abs(val);
  if (isDebitMarker) val = -Math.abs(val);
  return val;
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
  if (
    text.includes("uber") ||
    text.includes("lyft") ||
    text.includes("taxi")
  ) {
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
  date: ["date", "transaction date", "posted date", "posting date", "trans date"],
  description: [
    "description",
    "details",
    "memo",
    "payee",
    "transaction description",
    "narrative",
  ],
  debit: ["debit", "withdrawal", "outflow", "money out", "charge", "dr"],
  credit: ["credit", "deposit", "inflow", "money in", "payment", "credit amount", "cr"],
  amount: ["amount", "amt", "transaction amount", "value", "amount (usd)", "amount (cad)"],
  type: ["type", "dr/cr", "transaction type", "debit/credit"],
};

export function normalizeHeaderRow(line, delimiter = ",") {
  const parts = splitCsvLine(line, delimiter).map((h) => h.trim());

  return parts.map((cell) => {
    let h = cell.toLowerCase().replace(/"/g, "");
    h = h.replace(/\s+/g, " ").trim();
    return h;
  });
}

export function findHeaderIndex(header, aliases) {
  return header.findIndex(
    (h) => aliases.includes(h) || aliases.some((a) => h.includes(a))
  );
}

/**
 * Normalize a date string into YYYY-MM-DD where possible.
 * Handles lots of common formats & falls back to the raw string.
 */
export function parseDateCell(cell) {
  if (!cell) return "";
  let s = String(cell).trim().replace(/"/g, "");
  if (!s) return "";

  // ISO-ish: 2024-01-05, 2024/01/05, 2024.01.05
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Compact: 20240105
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo}-${d}`;
  }

  // 01/05/2024 or 05/01/24 (MM/DD or DD/MM)
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, c] = m;
    let year = c.length === 2 ? (Number(c) >= 70 ? `19${c}` : `20${c}`) : c;
    const nA = Number(a);
    const nB = Number(b);

    let month, day;
    if (nA > 12 && nB <= 12) {
      // 31/01/2024 style → DD/MM
      day = nA;
      month = nB;
    } else {
      // default to MM/DD
      month = nA;
      day = nB;
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`;
  }

  // 5 Jan 2024
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/);
  if (m) {
    const [, d, mon, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const idx = monthNames.indexOf(mon.toLowerCase().slice(0, 3));
    if (idx >= 0) {
      const month = String(idx + 1).padStart(2, "0");
      const day = String(d).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  // Jan 5, 2024
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m) {
    const [, mon, d, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const idx = monthNames.indexOf(mon.toLowerCase().slice(0, 3));
    if (idx >= 0) {
      const month = String(idx + 1).padStart(2, "0");
      const day = String(d).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  // Last resort – let JS try
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  // If we really can't figure it out, keep the raw string
  return s;
}

/**
 * Get a human-ish list of column labels for mapping UI.
 * If the first line looks header-less, we synthesize "Column 1", etc.
 */
export function getCsvColumnsForMapping(text) {
  const delimiter = detectDelimiter(text);
  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  if (!firstLine) return [];

  const rawCols = splitCsvLine(firstLine, delimiter).map((c) =>
    c.trim().replace(/^"|"$/g, "")
  );

  const hasLetter = rawCols.some((c) => /[a-zA-Z]/.test(c));

  if (!hasLetter) {
    // Probably header-less → generic labels
    return rawCols.map((_, idx) => `Column ${idx + 1}`);
  }

  // Use whatever header is there, falling back to generic labels when blank
  return rawCols.map((c, idx) => c || `Column ${idx + 1}`);
}

/**
 * Main CSV → [{ date, description, amount, category }]
 * Handles header-based and header-less CSVs, plus various date/amount formats.
 */
export function parseCsvTransactions(text) {
  if (!text) return [];
  const cleanText = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const lines = cleanText
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  let header = normalizeHeaderRow(lines[0], delimiter);
  let startIndex = 1;

  function getIndexes(headerRow) {
    const dateIndex = findHeaderIndex(headerRow, HEADER_ALIASES.date);
    const descIndex = findHeaderIndex(headerRow, HEADER_ALIASES.description);
    const amountIndex = findHeaderIndex(headerRow, HEADER_ALIASES.amount);
    const debitIndex = findHeaderIndex(headerRow, HEADER_ALIASES.debit);
    const creditIndex = findHeaderIndex(headerRow, HEADER_ALIASES.credit);
    const typeIndex = findHeaderIndex(headerRow, HEADER_ALIASES.type);
    return { dateIndex, descIndex, amountIndex, debitIndex, creditIndex, typeIndex };
  }

  let {
    dateIndex,
    descIndex,
    amountIndex,
    debitIndex,
    creditIndex,
    typeIndex,
  } = getIndexes(header);

  const noUsefulHeader =
    dateIndex < 0 &&
    descIndex < 0 &&
    amountIndex < 0 &&
    debitIndex < 0 &&
    creditIndex < 0;

  // If we didn't recognize ANY header columns, assume it's header-less.
  if (noUsefulHeader) {
    const firstCols = splitCsvLine(lines[0], delimiter).map((c) => c.trim());

    const syntheticHeader = firstCols.map((_, idx) => {
      if (idx === 0) return "date";
      if (idx === 1) return "description";
      if (idx === 2 || idx === firstCols.length - 1) return "amount";
      return `col${idx + 1}`;
    });

    header = syntheticHeader;
    startIndex = 0;

    ({
      dateIndex,
      descIndex,
      amountIndex,
      debitIndex,
      creditIndex,
      typeIndex,
    } = getIndexes(header));
  }

  // Fallback: if no explicit amount/debit/credit columns, guess the most numeric column.
  function guessAmountIndex() {
    const maxLook = Math.min(lines.length, 25);
    const numericCounts = [];
    for (let i = startIndex; i < maxLook; i++) {
      const cols = splitCsvLine(lines[i], delimiter);
      cols.forEach((cell, idx) => {
        const num = parseAmountCell(cell);
        if (!Number.isNaN(num)) {
          numericCounts[idx] = (numericCounts[idx] || 0) + 1;
        }
      });
    }
    let best = -1;
    let bestCount = 0;
    numericCounts.forEach((count, idx) => {
      if (count > bestCount) {
        bestCount = count;
        best = idx;
      }
    });
    return bestCount >= 2 ? best : -1;
  }

  if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0) {
    const guessed = guessAmountIndex();
    if (guessed >= 0) {
      amountIndex = guessed;
    }
  }

  function applyTypeSign(amount, row) {
    if (!row || typeIndex < 0) return amount;
    const cell = row[typeIndex]?.toString().toLowerCase() || "";
    if (!cell) return amount;
    const debitLike =
      cell.includes("debit") ||
      cell.includes("withdrawal") ||
      cell.includes("payment") ||
      cell.includes("dr") ||
      cell === "d";
    const creditLike =
      cell.includes("credit") ||
      cell.includes("deposit") ||
      cell.includes("refund") ||
      cell.includes("cr") ||
      cell === "c";
    if (debitLike) return -Math.abs(amount);
    if (creditLike) return Math.abs(amount);
    return amount;
  }

  const rows = [];

  for (let i = startIndex; i < lines.length; i++) {
    const raw = lines[i];
    const cols = splitCsvLine(raw, delimiter).map((c) => c.trim());

    if (cols.length === 0 || cols.every((c) => c === "")) continue;

    const rawDate = dateIndex >= 0 ? cols[dateIndex] : "";
    const date = parseDateCell(rawDate);
    const description = descIndex >= 0 ? cols[descIndex] : "";

    let amount = NaN;

    if (amountIndex >= 0) {
      // Single Amount column
      amount = parseAmountCell(cols[amountIndex]);
      amount = applyTypeSign(amount, cols);
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
    if (!date && !description && Number.isNaN(amount)) continue;

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

/**
 * Manual override parser used when the user specifies which columns
 * are date/description/amount.
 */
export function parseCsvWithMapping(
  text,
  { dateIndex = null, descIndex = null, amountIndex = null } = {}
) {
  if (!text) return [];
  const cleanText = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const lines = cleanText
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const rows = [];

  // Assume first line is header for mapping purposes
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = splitCsvLine(raw, delimiter).map((c) => c.trim());
    if (cols.length === 0 || cols.every((c) => c === "")) continue;

    const rawDate =
      dateIndex != null && dateIndex >= 0 ? cols[dateIndex] : "";
    const date = parseDateCell(rawDate);
    const description =
      descIndex != null && descIndex >= 0 ? cols[descIndex] : "";

    let amount = NaN;
    if (amountIndex != null && amountIndex >= 0) {
      amount = parseAmountCell(cols[amountIndex]);
    }

    if (!date && !description && Number.isNaN(amount)) continue;
    if (typeof amount !== "number" || Number.isNaN(amount)) continue;

    const category = categorizeTransaction(description, amount);
    rows.push({ date, description, amount, category });
  }

  return rows;
}
