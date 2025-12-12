// userMetadataApi.js
import { supabase } from "./supabaseClient";

export const AVATAR_CHOICES = [
  "💸",
  "🚀",
  "🌙",
  "🛡️",
  "📊",
  "⚡",
  "🧿",
  "🎯",
  "🛰️",
  "🎮",
];

function hashString(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeUsername(raw, fallback = "Budgeteer") {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const safe = trimmed.replace(/[^a-zA-Z0-9_\- ]+/g, "").slice(0, 32);
  return safe || fallback;
}

function buildDefaultProfile(user) {
  const emailPrefix = user?.email?.split("@")[0] ?? "";
  const username = normalizeUsername(emailPrefix, "Budgeteer");
  const seed = user?.id || user?.email || username || String(Date.now());
  const avatarIndex = hashString(seed) % AVATAR_CHOICES.length;
  return {
    username,
    avatar_emoji: AVATAR_CHOICES[avatarIndex],
  };
}

let hasUserMetadataTable = true;

function fallbackProfile(user) {
  const safeUser = typeof user === "string" ? { id: user } : user;
  return buildDefaultProfile(safeUser);
}

export async function loadOrCreateUserProfile(user) {
  const userId = typeof user === "string" ? user : user?.id;
  if (!userId) return null;

  if (!hasUserMetadataTable) {
    return fallbackProfile(user);
  }

  try {
    const { data, error } = await supabase
      .from("user_metadata")
      .select("username, avatar_emoji")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        const defaults = buildDefaultProfile(
          typeof user === "string" ? { id: userId } : user
        );
        const { data: inserted, error: insertError } = await supabase
          .from("user_metadata")
          .insert({ id: userId, ...defaults })
          .select("username, avatar_emoji")
          .single();
        if (insertError) {
          console.error("Failed to insert default profile:", insertError);
          return defaults;
        }
        return inserted ?? defaults;
      }
      console.error("Failed to load user metadata:", error);
      if (error?.code === "PGRST205") {
        hasUserMetadataTable = false;
        return fallbackProfile(user);
      }
      return null;
    }

    return data ?? null;
  } catch (err) {
    console.error("Unexpected error loading profile metadata:", err);
    if (err?.message?.includes("user_metadata")) {
      hasUserMetadataTable = false;
      return fallbackProfile(user);
    }
    return null;
  }
}

export async function updateUserProfile(userId, { username, avatar_emoji } = {}) {
  if (!userId) throw new Error("Missing user id for profile update");

  if (!hasUserMetadataTable) {
    return fallbackProfile({ id: userId });
  }

  const payload = {};
  if (typeof username === "string") {
    payload.username = normalizeUsername(username);
  }
  if (typeof avatar_emoji === "string" && avatar_emoji.length <= 4) {
    payload.avatar_emoji = avatar_emoji;
  }

  const hasUpdates = Object.keys(payload).length > 0;
  if (!hasUpdates) {
    const { data } = await supabase
      .from("user_metadata")
      .select("username, avatar_emoji")
      .eq("id", userId)
      .single();
    return data ?? buildDefaultProfile({ id: userId });
  }

  const { data, error } = await supabase
    .from("user_metadata")
    .update(payload)
    .eq("id", userId)
    .select("username, avatar_emoji")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Row missing unexpectedly, recreate with defaults merged with payload
      const defaults = {
        ...buildDefaultProfile({ id: userId }),
        ...payload,
      };
      const { data: inserted, error: insertError } = await supabase
        .from("user_metadata")
        .insert({ id: userId, ...defaults })
        .select("username, avatar_emoji")
        .single();
      if (insertError) {
        console.error("Failed to recreate missing profile row:", insertError);
        throw insertError;
      }
      return inserted ?? defaults;
    }

    console.error("Failed to update user metadata:", error);
    if (error?.code === "PGRST205") {
      hasUserMetadataTable = false;
      return fallbackProfile({ id: userId });
    }
    throw error;
  }

  return data;
}
