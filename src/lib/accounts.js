// src/lib/accounts.js
import { normalizeKey, KNOWN_BANKS } from "./csv.js";

export function sumAmounts(items) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

export function computeNetTransactions(account) {
  const txs = Array.isArray(account?.transactions)
    ? account.transactions
    : [];
  return txs.reduce(
    (sum, tx) => sum + (typeof tx.amount === "number" ? tx.amount : 0),
    0
  );
}

export function normalizeAccounts(accs) {
  return (accs || []).map((acc) => ({
    ...acc,
    startingBalance:
      typeof acc.startingBalance === "number" ? acc.startingBalance : 0,
  }));
}

export function mergeTransactions(existing, incoming) {
  const makeKey = (tx) =>
    `${(tx.date || "").trim()}|${(tx.description || "")
      .trim()
      .toLowerCase()}|${isNaN(tx.amount) ? "NaN" : tx.amount}`;

  const seen = new Set(existing.map((tx) => makeKey(tx)));
  const merged = [...existing];

  for (const tx of incoming) {
    const key = makeKey(tx);
    if (!seen.has(key)) {
      merged.push(tx);
      seen.add(key);
    }
  }

  return merged;
}

function buildDescriptionSet(transactions = []) {
  const set = new Set();
  (transactions || []).forEach((tx) => {
    const desc = (tx.description || "").trim().toLowerCase();
    if (!desc) return;
    set.add(desc);
  });
  return set;
}

// We now rely on KNOWN_BANKS + normalizeKey from csv.js
// KNOWN_BANKS is an array like: [{ key: "chase", label: "Chase" }, ...]

// Heuristic account type from rows
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
  // --- 1. Try to detect bank from the file name using KNOWN_BANKS ---
  const sourceKey = normalizeKey(sourceName);
  if (sourceKey) {
    for (const bank of KNOWN_BANKS) {
      const matchKey = (bank.key || bank.match || "").toLowerCase();
      if (matchKey && sourceKey.includes(matchKey)) {
        return `${bank.label} Account`;
      }
    }
  }

  // --- 2. Try to detect bank from the first 20 descriptions ---
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

  // --- 3. Fallback to your original "first word" heuristic ---
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

export function detectTargetAccountForImport(
  accounts = [],
  currentAccountId,
  importedRows = []
) {
  const withTransactions = (accounts || []).filter(
    (acc) => Array.isArray(acc.transactions) && acc.transactions.length > 0
  );

  // If no account has transactions, treat this as a new account
  if (!withTransactions.length) {
    return null;
  }

  const importedDescriptions = buildDescriptionSet(importedRows);
  if (!importedDescriptions.size) {
    return currentAccountId;
  }

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

  if (bestAccountId && (bestOverlap >= 3 || overlapRatio >= 0.2)) {
    return bestAccountId;
  }

  // Otherwise looks like a new account
  return null;
}

export function importTransactionsWithDetection(
  accounts = [],
  currentAccountId,
  importedRows = [],
  sourceName = ""
) {
  const targetId = detectTargetAccountForImport(
    accounts,
    currentAccountId,
    importedRows
  );

  // Case 1: matched an existing account
  if (targetId) {
    const nextAccounts = (accounts || []).map((acc) =>
      acc.id === targetId
        ? {
            ...acc,
            transactions: mergeTransactions(acc.transactions || [], importedRows),
          }
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

  // Case 2: create a new account
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
  };

  return {
    targetAccountId: newId,
    targetAccountName: name,
    accounts: [...(accounts || []), newAccount],
    createdNew: true,
  };
}
