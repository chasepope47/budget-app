// userStateApi.js
import { supabase } from "./supabaseClient";

// Save complete app state as JSON
export async function saveUserState(userId, state) {
  if (!userId) return;
  await supabase.from("user_state").upsert(
    {
      id: userId,
      state,
    },
    { onConflict: "id" }
  );
}

// Load complete app state JSON
export async function loadUserState(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("user_state")
    .select("state")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error loading user state:", error);
    return null;
  }

  return data?.state ?? null;
}
