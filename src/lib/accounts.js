// src/lib/accounts.js
import { normalizeKey, KNOWN_BANKS } from "./csv.js";

/* ---------------- Basic helpers ---------------- */

export function sumAmounts(items = [], key = "amount") {
  const list = Array.isArray(items) ? items : [];
  return list.reduce((sum, item) => {
    const v = item?.[key];
    const n = typeof v === "number" ? v : Number(v);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function computeNetTransactions(account) {
  const txs = Array.isArray(account?.transactions) ? account.transactions : [];
  return txs.reduce((sum, tx) => sum + (typeof tx.amount === "number" ? tx.amount : 0), 0);
}

/**
 * ✅ Normalize accounts (and add new balance/statement fields safely)
 */
export function normalizeAccounts(accs) {
  return (Array.isArray(accs) ? accs : []).map((acc) => ({
    ...acc,
    startingBalance: typeof acc.startingBalance === "number" ? acc.startingBalance : 0,
    transactions: Array.isArray(acc.transactions) ? acc.transactions : [],

    // ✅ NEW FIELDS (safe defaults)
    currentBalance: Number.isFinite(Number(acc.currentBalance)) ? Number(acc.currentBalance) : null,
    currentBalanceAsOf: typeof acc.currentBalanceAsOf === "string" ? acc.currentBalanceAsOf : "",
    lastStatementKey: typeof acc.lastStatementKey === "string" ? acc.lastStatementKey : "",
    lastConfirmedEndingBalance: Number.isFinite(Number(acc.lastConfirmedEndingBalance))
      ? Number(acc.lastConfirmedEndingBalance)
      : null,
    statementBalances:
      acc && typeof acc.statementBalances === "object" && acc.statementBalances !== null
        ? acc.statementBalances
        : {},
  }));
}

/**
 * ✅ This is what the dashboard + balances page should use.
 * Prefer a confirmed balance if we have one.
 */
export function computeAccountBalance(acc) {
  if (!acc) return 0;

  const confirmed = Number(acc.currentBalance);
  if (Number.isFinite(confirmed)) return confirmed;

  const starting = typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
  const net = computeNetTransactions(acc);
  return starting + net;
}

/* ---------------- Transactions merge ---------------- */

export function mergeTransactions(existing, incoming) {
  const makeKey = (tx) =>
    `${(tx.date || "").trim()}|${(tx.description || "").trim().toLowerCase()}|${
      Number.isFinite(Number(tx.amount)) ? Number(tx.amount) : "NaN"
    }`;

  const a = Array.isArray(existing) ? existing : [];
  const b = Array.isArray(incoming) ? incoming : [];

  const seen = new Set(a.map((tx) => makeKey(tx)));
  const merged = [...a];

  for (const tx of b) {
    const key = makeKey(tx);
    if (!seen.has(key)) {
      merged.push(tx);
      seen.add(key);
    }
  }

  return merged;
}

/* ---------------- Statement balance application ---------------- */

/**
 * ✅ Apply a confirmed statement balance to the right account safely.
 *
 * statement = {
 *   statementKey, startISO, endISO,
 *   endingBalance, startingBalance,
 *   transactionSum
 * }
 *
 * balanceSource is optional: "user" | "csv" | "suggested" etc.
 */
export function applyStatementToAccounts(
  accounts = [],
  accountId,
  statement,
  balanceSource = "user"
) {
  if (!accountId) return normalizeAccounts(accounts);

  const list = normalizeAccounts(accounts);
  const st = statement && typeof statement === "object" ? statement : null;
  if (!st) return list;

  const key = String(st.statementKey || "").trim();
  if (!key) return list;

  const endBal = Number(st.endingBalance);
  const startBal = Number(st.startingBalance);

  const nextStatementEntry = {
    statementKey: key,
    startISO: st.startISO || "",
    endISO: st.endISO || "",
    endingBalance: Number.isFinite(endBal) ? endBal : null,
    startingBalance: Number.isFinite(startBal) ? startBal : null,
    transactionSum: Number.isFinite(Number(st.transactionSum)) ? Number(st.transactionSum) : null,
    balanceSource,
    confirmedAt: new Date().toISOString(),
  };

  return normalizeAccounts(
    list.map((acc) => {
      if (acc.id !== accountId) return acc;

      const nextMap = { ...(acc.statementBalances || {}) };
      nextMap[key] = nextStatementEntry;

      // If we have an ending balance, promote it to currentBalance
      const hasEnding = Number.isFinite(Number(nextStatementEntry.endingBalance));

      return {
        ...acc,
        statementBalances: nextMap,
        lastStatementKey: key,
        lastConfirmedEndingBalance: hasEnding ? Number(nextStatementEntry.endingBalance) : acc.lastConfirmedEndingBalance,
        currentBalance: hasEnding ? Number(nextStatementEntry.endingBalance) : acc.currentBalance,
        currentBalanceAsOf: nextStatementEntry.endISO || acc.currentBalanceAsOf,
      };
    })
  );
}

/* ---------------- Account detection helpers ---------------- */

function buildDescriptionSet(transactions = []) {
  const set = new Set();
  (transactions || []).forEach((tx) => {
    const desc = (tx.description || "").trim().toLowerCase();
    if (!desc) return;
    set.add(desc);
  });
  return set;
}

function guessAccountTypeFromRows(rows = []) {
  if (!rows.length) return "checking";
  let negatives = 0;
  let positives = 0;
  for (const tx of rows) {
    if (typeof tx.amount !== "number") continue;
    if (tx.amount < 0) negatives++;
    else if (tx.amount > 0) positives++;
  }
  if (negatives === 0 && positives === 0) return "checking";
  const ratio = negatives / (negatives + positives);
  return ratio >= 0.7 ? "credit" : "checking";
}

function guessAccountNameFromRows(rows = [], sourceName = "") {
  const sourceKey = normalizeKey(sourceName);
  if (sourceKey) {
    for (const bank of KNOWN_BANKS) {
      const matchKey = (bank.key || bank.match || "").toLowerCase();
      if (matchKey && sourceKey.includes(matchKey)) {
        return `${bank.label} Account`;
      }
    }
  }

  if (rows.length) {
    const joinedDescriptions = rows
      .slice(0, 20)
      .map((r) => r.description || "")
      .join(" ");

    const descKey = normalizeKey(joinedDescriptions);

    if (descKey) {
      for (const bank of KNOWN_BANKS) {
        const matchKey = (bank.key || bank.match || "").toLowerCase();
        if (matchKey && descKey.includes(matchKey)) {
          return `${bank.label} Account`;
        }
      }
    }
  }

  if (!rows.length) return "Imported Account";

  const sample = (rows[0].description || "").trim();
  if (!sample) return "Imported Account";

  const words = sample.split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return "Imported Account";

  const label = words[0].replace(/[^a-z0-9]/gi, " ");
  const cleaned = label.trim();
  if (!cleaned) return "Imported Account";

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + " Account";
}

/* ---------------- Main import helpers ---------------- */

export function detectTargetAccountForImport(
  accounts = [],
  currentAccountId,
  importedRows = []
) {
  const withTransactions = (accounts || []).filter(
    (acc) => Array.isArray(acc.transactions) && acc.transactions.length > 0
  );

  if (!withTransactions.length) return null;

  const importedDescriptions = buildDescriptionSet(importedRows);
  if (!importedDescriptions.size) return currentAccountId;

  let bestAccountId = null;
  let bestOverlap = 0;

  for (const acc of withTransactions) {
    const existingDescriptions = buildDescriptionSet(acc.transactions);
    if (!existingDescriptions.size) continue;

    let overlap = 0;
    for (const desc of importedDescriptions) {
      if (existingDescriptions.has(desc)) overlap++;
    }

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestAccountId = acc.id;
    }
  }

  const overlapRatio =
    importedDescriptions.size > 0 ? bestOverlap / importedDescriptions.size : 0;

  if (bestAccountId && (bestOverlap >= 3 || overlapRatio >= 0.2)) return bestAccountId;

  return null;
}

export function importTransactionsWithDetection(
  accounts = [],
  currentAccountId,
  importedRows = [],
  sourceName = ""
) {
  const targetId = detectTargetAccountForImport(accounts, currentAccountId, importedRows);

  if (targetId) {
    const nextAccounts = (accounts || []).map((acc) =>
      acc.id === targetId
        ? { ...acc, transactions: mergeTransactions(acc.transactions || [], importedRows) }
        : acc
    );

    const matched = (accounts || []).find((a) => a.id === targetId);

    return {
      targetAccountId: targetId,
      targetAccountName: matched?.name || "Account",
      accounts: nextAccounts,
      createdNew: false,
    };
  }

  const type = guessAccountTypeFromRows(importedRows);
  const name = guessAccountNameFromRows(importedRows, sourceName);
  const newId =
    name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") +
    "-" +
    Date.now();

  const newAccount = {
    id: newId,
    name,
    type,
    startingBalance: 0,
    transactions: importedRows,

    // ✅ initialize new fields so downstream UI is consistent
    currentBalance: null,
    currentBalanceAsOf: "",
    lastStatementKey: "",
    lastConfirmedEndingBalance: null,
    statementBalances: {},
  };

  return {
    targetAccountId: newId,
    targetAccountName: name,
    accounts: [...(accounts || []), newAccount],
    createdNew: true,
  };
}
