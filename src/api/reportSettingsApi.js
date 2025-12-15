// src/api/reportSettingsApi.js
// Firebase/Supabase-free report settings persistence.
// Uses localStorage so the app builds/deploys cleanly.

export const DEFAULT_REPORT_SETTINGS = {
  topNPerBucket: 10,
  maxRows: 20000,
  includeTransfers: true,
  preset: "Detailed",
};

const KEY_PREFIX = "budgetApp_reportSettings_v1_";

function keyFor(userId) {
  // allow per-user settings if you pass a UID; fallback to "anon"
  return `${KEY_PREFIX}${userId || "anon"}`;
}

export async function fetchReportSettings(userId) {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveReportSettings(userId, settings) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
