// src/workspaceStateApi.js
import { db } from "./firebaseClient";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function loadWorkspaceState(workspaceId) {
  if (!workspaceId) return null;
  try {
    const ref = doc(db, "workspaces", workspaceId);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data().state ?? null) : null;
  } catch (err) {
    console.error("loadWorkspaceState failed", err);
    return null;
  }
}

export async function saveWorkspaceState(workspaceId, state) {
  if (!workspaceId) return;
  try {
    const ref = doc(db, "workspaces", workspaceId);
    await setDoc(
      ref,
      { state, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error("saveWorkspaceState failed", err);
    throw err;
  }
}
