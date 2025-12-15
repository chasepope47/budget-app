// src/userProfileApi.firebase.js
import { db } from "./firebaseClient";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export const AVATAR_CHOICES = ["💸","🚀","🌙","🛡️","📊","⚡","🧿","🎯","🛰️","🎮"];

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
  const seed = user?.uid || user?.email || username || String(Date.now());
  const avatarIndex = hashString(seed) % AVATAR_CHOICES.length;
  return { username, avatarEmoji: AVATAR_CHOICES[avatarIndex] };
}

export async function loadOrCreateUserProfile(user) {
  const uid = user?.uid;
  if (!uid) return null;

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return snap.data();

  const defaults = buildDefaultProfile(user);
  await setDoc(ref, { ...defaults, createdAt: serverTimestamp() }, { merge: true });
  return defaults;
}

export async function updateUserProfile(uid, { username, avatarEmoji } = {}) {
  if (!uid) throw new Error("Missing uid");
  const payload = {};
  if (typeof username === "string") payload.username = normalizeUsername(username);
  if (typeof avatarEmoji === "string") payload.avatarEmoji = avatarEmoji;

  const ref = doc(db, "users", uid);
  await updateDoc(ref, payload);
  const snap = await getDoc(ref);
  return snap.data();
}
