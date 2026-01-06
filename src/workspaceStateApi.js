// src/workspaceStateApi.js
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit as limitQ,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebaseClient.js";

/**
 * How often we write a history snapshot (ms)
 * IMPORTANT: your UI saves frequently (~450ms). You do NOT want history that often.
 */
const HISTORY_SNAPSHOT_INTERVAL_MS = 1000 * 60 * 10; // 10 minutes

/**
 * Save workspace state (no wiping)
 * - writes /workspaces/{workspaceId}.state
 * - updates lastModified/version
 * - creates history snapshot occasionally (not every save)
 */
export async function saveWorkspaceState(workspaceId, state) {
  if (!workspaceId || !state) return false;

  const workspaceRef = doc(db, "workspaces", workspaceId);

  // NOTE: We store clientUpdatedAt inside state (you already do)
  // and store server timestamps at the workspace root.
  const clientNow = Date.now();
  const nextState = { ...state, clientUpdatedAt: clientNow };

  try {
    const snap = await getDoc(workspaceRef);
    const existing = snap.exists() ? snap.data() : null;

    // Decide whether to create a history snapshot
    const lastSnapAt = existing?.lastHistorySnapshotAt?.toMillis
      ? existing.lastHistorySnapshotAt.toMillis()
      : 0;

    const shouldSnapshot =
      !!existing?.state &&
      (clientNow - lastSnapAt >= HISTORY_SNAPSHOT_INTERVAL_MS);

    if (shouldSnapshot) {
      const historyRef = collection(db, "workspaces", workspaceId, "history");
      await addDoc(historyRef, {
        state: existing.state,
        timestamp: serverTimestamp(),
        snapshot: true,
      });
    }

    if (!snap.exists()) {
      // First write
      await setDoc(workspaceRef, {
        state: nextState,
        name: existing?.name || "My Budget",
        version: 1,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        lastHistorySnapshotAt: shouldSnapshot ? serverTimestamp() : serverTimestamp(),
      });
      return true;
    }

    // Normal update
    await updateDoc(workspaceRef, {
      state: nextState,
      version: (existing?.version || 0) + 1,
      lastModified: serverTimestamp(),
      ...(shouldSnapshot ? { lastHistorySnapshotAt: serverTimestamp() } : {}),
    });

    return true;
  } catch (error) {
    console.error("saveWorkspaceState failed:", error);
    throw error;
  }
}

/**
 * Load workspace state with smart merge
 * - if no remote: optionally seed from local
 * - if both: merge (keeps both, dedupes arrays by id)
 */
export async function loadWorkspaceState(workspaceId, localState = null) {
  if (!workspaceId) return null;

  const workspaceRef = doc(db, "workspaces", workspaceId);

  try {
    const snap = await getDoc(workspaceRef);

    if (!snap.exists()) {
      if (localState) {
        await saveWorkspaceState(workspaceId, localState);
        return localState;
      }
      return null;
    }

    const remoteState = snap.data()?.state ?? null;
    if (!localState) return remoteState;

    return mergeWorkspaceStates(localState, remoteState);
  } catch (error) {
    console.error("loadWorkspaceState failed:", error);
    throw error;
  }
}

/**
 * Initialize workspace on first login
 * - seeds remote if missing
 * - otherwise merges remote + local
 */
export async function initializeWorkspace(workspaceId, localState) {
  if (!workspaceId) return localState ?? null;

  const workspaceRef = doc(db, "workspaces", workspaceId);

  try {
    const snap = await getDoc(workspaceRef);

    if (!snap.exists()) {
      if (localState) {
        await saveWorkspaceState(workspaceId, localState);
        return localState;
      }
      return null;
    }

    const remoteState = snap.data()?.state ?? null;
    return mergeWorkspaceStates(localState, remoteState);
  } catch (error) {
    console.error("initializeWorkspace failed:", error);
    return localState ?? null;
  }
}

/**
 * Get version history list
 */
export async function getWorkspaceHistory(workspaceId, limitCount = 20) {
  if (!workspaceId) return [];

  try {
    const historyRef = collection(db, "workspaces", workspaceId, "history");
    const q = query(historyRef, orderBy("timestamp", "desc"), limitQ(limitCount));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("getWorkspaceHistory failed:", error);
    return [];
  }
}

/**
 * Restore a workspace version
 * - saves current to history
 * - writes restored state as current
 */
export async function restoreWorkspaceVersion(workspaceId, historyId) {
  if (!workspaceId || !historyId) return null;

  try {
    const historyDocRef = doc(db, "workspaces", workspaceId, "history", historyId);
    const historySnap = await getDoc(historyDocRef);
    if (!historySnap.exists()) throw new Error("History version not found");

    const historicalState = historySnap.data()?.state;
    if (!historicalState) throw new Error("Invalid history data");

    const workspaceRef = doc(db, "workspaces", workspaceId);
    const currentSnap = await getDoc(workspaceRef);

    if (currentSnap.exists()) {
      const historyRef = collection(db, "workspaces", workspaceId, "history");
      await addDoc(historyRef, {
        state: currentSnap.data()?.state ?? null,
        timestamp: serverTimestamp(),
        snapshot: true,
        restoredFrom: historyId,
      });
    }

    await saveWorkspaceState(workspaceId, historicalState);
    return historicalState;
  } catch (error) {
    console.error("restoreWorkspaceVersion failed:", error);
    throw error;
  }
}

/**
 * ✅ Merge that matches YOUR ACTUAL state keys
 */
function mergeWorkspaceStates(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  return {
    // Prefer remote for shared “truth” fields
    accounts: mergeArraysById(local.accounts || [], remote.accounts || []),
    goals: mergeArraysById(local.goals || [], remote.goals || []),
    scheduledTemplates: mergeArraysById(
      local.scheduledTemplates || [],
      remote.scheduledTemplates || []
    ),

    budgetsByMonth: {
      ...(local.budgetsByMonth || {}),
      ...(remote.budgetsByMonth || {}),
    },

    scheduleChecks: {
      ...(local.scheduleChecks || {}),
      ...(remote.scheduleChecks || {}),
    },

    // Prefer remote for these (shared across users)
    activeMonth: remote.activeMonth || local.activeMonth || "2026-01",
    currentAccountId: remote.currentAccountId || local.currentAccountId || "main",
    selectedGoalId:
      remote.selectedGoalId !== undefined ? remote.selectedGoalId : local.selectedGoalId,

    theme: remote.theme || local.theme || "dark",

    // Navigation + layout settings: remote wins
    navOrder: Array.isArray(remote.navOrder) ? remote.navOrder : local.navOrder,
    dashboardSectionsOrder: Array.isArray(remote.dashboardSectionsOrder)
      ? remote.dashboardSectionsOrder
      : local.dashboardSectionsOrder,

    // View/page is “per device preference” — keep local if present
    homePage: local.homePage || remote.homePage || "dashboard",
    txFilter: local.txFilter ?? remote.txFilter ?? "",

    // Keep newest clientUpdatedAt
    clientUpdatedAt: Math.max(
      Number(local.clientUpdatedAt || 0),
      Number(remote.clientUpdatedAt || 0)
    ),
  };
}

/**
 * Merge arrays by item.id (remote wins on conflicts)
 */
function mergeArraysById(localArr, remoteArr) {
  const map = new Map();
  for (const item of localArr) if (item?.id) map.set(item.id, item);
  for (const item of remoteArr) if (item?.id) map.set(item.id, item);
  return Array.from(map.values());
}
