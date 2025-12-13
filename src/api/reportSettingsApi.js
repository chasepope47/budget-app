import { supabase } from "../supabaseClient";

export const REPORT_SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_REPORT_SETTINGS = {
  topNPerBucket: 10,
  maxRows: 20000,
  includeTransfers: true,
  preset: "Custom",
  schemaVersion: REPORT_SETTINGS_SCHEMA_VERSION,
};

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};

  const merged = { ...DEFAULT_REPORT_SETTINGS, ...s };

  merged.topNPerBucket = clampInt(
    merged.topNPerBucket,
    1,
    50,
    DEFAULT_REPORT_SETTINGS.topNPerBucket
  );

  merged.maxRows = clampInt(
    merged.maxRows,
    1000,
    200000,
    DEFAULT_REPORT_SETTINGS.maxRows
  );

  merged.includeTransfers = Boolean(merged.includeTransfers);
  merged.preset = typeof merged.preset === "string" ? merged.preset : "Custom";
  merged.schemaVersion = REPORT_SETTINGS_SCHEMA_VERSION;

  return merged;
}

export async function fetchReportSettings(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("report_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.settings) return null;

  return normalizeSettings(data.settings);
}

export async function saveReportSettings(userId, settings) {
  if (!userId) return;

  const normalized = normalizeSettings(settings);

  const { error } = await supabase
    .from("report_settings")
    .upsert({ user_id: userId, settings: normalized }, { onConflict: "user_id" });

  if (error) throw error;
}

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

export function applyReportPreset(currentSettings, presetSettings) {
  return normalizeSettings({
    ...currentSettings,
    ...presetSettings,
    preset: presetSettings?.preset || "Custom",
  });
}
