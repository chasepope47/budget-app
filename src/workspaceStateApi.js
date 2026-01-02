// src/workspaceStateApi.js
import { db } from "./firebaseClient";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Firestore cannot store `undefined` anywhere (even deep inside objects/arrays).
 * It also rejects NaN/Infinity. This sanitizes your state tree.
 */
function sanitizeForFirestore(value) {
  // drop undefined entirely (caller will omit)
  if (value === undefined) return undefined;

  // keep null
  if (value === null) return null;

  // numbers: reject NaN/Infinity
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }

  // Dates -> ISO string (optional but safe)
  if (value instanceof Date) return value.toISOString();

  // arrays
  if (Array.isArray(value)) {
    const cleaned = value
      .map(sanitizeForFirestore)
      .filter((v) => v !== undefined); // remove undefined entries
    return cleaned;
  }

  // objects
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = sanitizeForFirestore(v);
      if (cleaned !== undefined) out[k] = cleaned; // omit undefined fields
    }
    return out;
  }

  // strings, booleans, etc
  return value;
}

export async function loadWorkspaceState(workspaceId) {
  if (!workspaceId) return null;
  try {
    const ref = doc(db, "workspaces", workspaceId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data().state ?? null : null;
  } catch (err) {
    console.error("loadWorkspaceState failed", err);
    return null;
  }
}

export async function saveWorkspaceState(workspaceId, state) {
  if (!workspaceId) return;

  const ref = doc(db, "workspaces", workspaceId);

  // ✅ sanitize once, right here, before any Firestore write
  const safeState = sanitizeForFirestore(state);

  try {
    // update if exists (fast path)
    await updateDoc(ref, {
      state: safeState,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    // if doc doesn't exist yet, create it
    if (err?.code === "not-found") {
      await setDoc(
        ref,
        { state: safeState, updatedAt: serverTimestamp() },
        { merge: true }
      );
      return true;
    }
    console.error("saveWorkspaceState failed", err);
    throw err;
  }
}
