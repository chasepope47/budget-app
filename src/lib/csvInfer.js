// src/lib/csvInfer.js

const normalize = (s) => String(s || "").trim().toLowerCase();

const DATE_KEYS = ["date", "posting date", "transaction date", "posted", "trans date"];
const DESC_KEYS = ["description", "desc", "merchant", "name", "memo", "details"];
const AMOUNT_KEYS = ["amount", "amt", "value"];
const DEBIT_KEYS = ["debit", "withdrawal", "outflow", "charge"];
const CREDIT_KEYS = ["credit", "deposit", "inflow", "payment"];

function scoreHeader(header, candidates) {
  const h = normalize(header);
  if (!h) return 0;
  let score = 0;
  for (const c of candidates) {
    if (h === c) score += 10;
    if (h.includes(c)) score += 6;
  }
  return score;
}

function looksLikeDate(v) {
  const s = String(v || "").trim();
  // very forgiving: 2025-12-31, 12/31/2025, 31/12/2025
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s);
}

function looksLikeMoney(v) {
  const s = String(v || "").trim().replace(/[$,]/g, "");
  if (!s) return false;
  return /^-?\d+(\.\d{1,2})?$/.test(s);
}

export function inferCsvMapping(headers = [], sampleRows = []) {
  // header-based scoring
  const headerScores = headers.map((h) => ({
    key: h,
    date: scoreHeader(h, DATE_KEYS),
    desc: scoreHeader(h, DESC_KEYS),
    amount: scoreHeader(h, AMOUNT_KEYS),
    debit: scoreHeader(h, DEBIT_KEYS),
    credit: scoreHeader(h, CREDIT_KEYS),
  }));

  const pickBest = (field) => {
    const best = [...headerScores].sort((a, b) => b[field] - a[field])[0];
    return best && best[field] > 0 ? best.key : null;
  };

  let dateKey = pickBest("date");
  let descKey = pickBest("desc");
  let amountKey = pickBest("amount");
  let debitKey = pickBest("debit");
  let creditKey = pickBest("credit");

  // content-based fallback if header guessing fails
  if (!dateKey && sampleRows.length) {
    for (const h of headers) {
      const hit = sampleRows.slice(0, 12).filter((r) => looksLikeDate(r[h])).length;
      if (hit >= 6) { dateKey = h; break; }
    }
  }

  if (!amountKey && sampleRows.length) {
    for (const h of headers) {
      const hit = sampleRows.slice(0, 12).filter((r) => looksLikeMoney(r[h])).length;
      if (hit >= 6) { amountKey = h; break; }
    }
  }

  // decide amount strategy
  const mode =
    amountKey ? "amount" :
    debitKey || creditKey ? "debitCredit" :
    "unknown";

  // confidence heuristic
  const confidence =
    (dateKey ? 0.34 : 0) +
    (descKey ? 0.33 : 0) +
    ((amountKey || debitKey || creditKey) ? 0.33 : 0);

  return {
    mode,
    dateKey,
    descKey,
    amountKey,
    debitKey,
    creditKey,
    confidence, // 0..1
  };
}

export function mapRowToTransaction(row, mapping) {
  const get = (k) => (k ? row[k] : null);

  const dateRaw = get(mapping.dateKey);
  const description = String(get(mapping.descKey) || "").trim();

  let amount = 0;
  if (mapping.mode === "amount") {
    amount = Number(String(get(mapping.amountKey) || "").replace(/[$,]/g, ""));
  } else if (mapping.mode === "debitCredit") {
    const debit = Number(String(get(mapping.debitKey) || "0").replace(/[$,]/g, ""));
    const credit = Number(String(get(mapping.creditKey) || "0").replace(/[$,]/g, ""));
    // convention: expenses negative, income positive
    amount = (credit || 0) - (debit || 0);
  }

  return {
    date: dateRaw, // convert later to ISO local
    description,
    amount: Number.isFinite(amount) ? amount : 0,
    raw: row,
  };
}
