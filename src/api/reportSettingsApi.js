import { supabase } from "../supabaseClient";

export const REPORT_SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_REPORT_SETTINGS = {
  topNPerBucket: 10,
  maxRows: 20000,
  includeTransfers: true,
  preset: "Custom",
  schemaVersion: REPORT_SETTINGS_SCHEMA_VERSION,
};

function normalizeSettings(raw) {
  const s = (raw && typeof raw === "object") ? raw : {};

  // Merge defaults first (ensures missing fields are filled)
  const merged = { ...DEFAULT_REPORT_SETTINGS, ...s };

  // Clamp / sanitize numbers
  merged.topNPerBucket = clampInt(merged.topNPerBucket, 1, 50, DEFAULT_REPORT_SETTINGS.topNPerBucket);
  merged.maxRows = clampInt(merged.maxRows, 1000, 200000, DEFAULT_REPORT_SETTINGS.maxRows);

  // Ensure booleans
  merged.includeTransfers = Boolean(merged.includeTransfers);

  // Keep preset as string
  merged.preset = typeof merged.preset === "string" ? merged.preset : "Custom";

  // Version stamp
  merged.schemaVersion = REPORT_SETTINGS_SCHEMA_VERSION;

  return merged;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/**
 * Fetch settings for a user.
 * Returns:
 * - normalized settings object (with defaults merged), OR null if not found.
 */
export async function fetchReportSettings(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("report_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  // If table/column isn't there yet, or it truly doesn't exist for this user:
  // - "maybeSingle" returns data=null with no error when no row matches
  if (error) throw error;

  if (!data?.settings) return null;
  return normalizeSettings(data.settings);
}

/**
 * Save settings for a user.
 * Uses upsert so it works for first-time save + updates.
 */
export async function saveReportSettings(userId, settings) {
  if (!userId) return;

  const normalized = normalizeSettings(settings);

  const { error } = await supabase
    .from("report_settings")
    .upsert(
      { user_id: userId, settings: normalized },
      { onConflict: "user_id" }
    );

  if (error) throw error;
}

/*\4

}} Reset to defaults (persists defaults).
 */
export async function resetReportSettings(userId) {
  if (!userId) return;

  const { error } = await supabase
    .from("report_settings")
    .upsert(
      { user_id: userId, settings: DEFAULT_REPORT_SETTINGS },
      { onConflict: "user_id" }
    );

  if (error) throw error;
}

/**
 * Local-only helper if you want to apply presets safely.
 */
export function applyReportPreset(currentSettings, presetSettings) {
  return normalizeSettings({ ...currentSettings, ...presetSettings, preset: presetSettings?.preset || "Custom" });
}

.3-2*1