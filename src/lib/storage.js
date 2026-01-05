// src/lib/storage.js

export const STORAGE_KEY = "budgetAppState_v1";

/**
 * Load from localStorage.
 * Optional key param for backward compatibility with older calls.
 */
export function loadStoredState(key = STORAGE_KEY) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to load stored state", err);
    return null;
  }
}

/**
 * Save to localStorage.
 * Supports BOTH:
 *   saveStoredState(state)
 *   saveStoredState(key, state)
 */
export function saveStoredState(arg1, arg2) {
  if (typeof window === "undefined") return;

  let key = STORAGE_KEY;
  let state = arg1;

  // If called as (key, state)
  if (typeof arg1 === "string") {
    key = arg1;
    state = arg2;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state", err);
  }
}

/**
 * Optional helper: given "YYYY-MM-DD" return "YYYY-MM".
 */
export function monthKeyFromISO(isoDayStr) {
  if (!isoDayStr || typeof isoDayStr !== "string") return "";
  return isoDayStr.slice(0, 7);
}

/**
 * Optional helper: convert "YYYY-MM" -> "Month YYYY" (e.g., "2026-01" -> "January 2026")
 */
export function monthLabelFromKey(monthKey) {
  if (!monthKey || typeof monthKey !== "string" || monthKey.length < 7) {
    return String(monthKey || "");
  }
  const [y, m] = monthKey.split("-");
  const year = Number(y);
  const monthIndex = Number(m) - 1;

  const d = new Date(year, monthIndex, 1);
  if (Number.isNaN(d.getTime())) return monthKey;

  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function migrateStoredState(stored) {
  if (!stored) return null;

  if (stored.accounts && Array.isArray(stored.accounts)) {
    return stored;
  }

  const defaultAccount = {
    id: "main",
    name: "Main Account",
    type: "checking",
    transactions: Array.isArray(stored.transactions) ? stored.transactions : [],
  };

  return {
    ...stored,
    accounts: [defaultAccount],
    currentAccountId: stored.currentAccountId || "main",
  };
}
