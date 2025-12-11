// src/lib/storage.js

export const STORAGE_KEY = "budgetAppState_v1";

export function loadStoredState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to load stored state", err);
    return null;
  }
}

export function saveStoredState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state", err);
  }
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
    transactions: Array.isArray(stored.transactions)
      ? stored.transactions
      : [],
  };

  return {
    ...stored,
    accounts: [defaultAccount],
    currentAccountId: stored.currentAccountId || "main",
  };
}
