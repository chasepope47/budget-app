// src/workspaceSharingApi.js
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  collectionGroup,
} from "firebase/firestore";
import { db } from "./firebaseClient.js";

export const PERMISSIONS = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
};

export function hasPermission(userRole, requiredRole) {
  const hierarchy = {
    [PERMISSIONS.VIEWER]: 1,
    [PERMISSIONS.EDITOR]: 2,
    [PERMISSIONS.ADMIN]: 3,
    [PERMISSIONS.OWNER]: 4,
  };
  return (hierarchy[userRole] || 0) >= (hierarchy[requiredRole] || 0);
}

/**
 * Create/update a member doc
 */
export async function createWorkspaceMember(
  workspaceId,
  userId,
  role = PERMISSIONS.OWNER,
  profile = {}
) {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);

  await setDoc(
    memberRef,
    {
      userId,
      role,
      displayName: profile.displayName || "User",
      email: profile.email || null,
      avatarUrl: profile.avatarUrl || null,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    },
    { merge: true }
  );

  return true;
}

export async function getWorkspaceMembers(workspaceId) {
  const membersRef = collection(db, "workspaces", workspaceId, "members");
  const snapshot = await getDocs(membersRef);

  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUserRole(workspaceId, userId) {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);
  const snap = await getDoc(memberRef);
  return snap.exists() ? snap.data()?.role || null : null;
}

/**
 * Create invitation
 * Optionally include invitedEmail for better UX + auditing.
 */
export async function createInvitation(
  workspaceId,
  invitedBy,
  role = PERMISSIONS.EDITOR,
  expiresInDays = 7,
  invitedEmail = null
) {
  const invitationId = generateInvitationCode();
  const invitationRef = doc(db, "invitations", invitationId);

  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  );

  await setDoc(invitationRef, {
    workspaceId,
    invitedBy,
    role,
    invitedEmail,
    createdAt: serverTimestamp(),
    expiresAt,
    status: "pending",
    usedBy: null,
  });

  return {
    invitationId,
    invitationUrl: `${window.location.origin}/invite/${invitationId}`,
  };
}

export async function getInvitation(invitationId) {
  const invitationRef = doc(db, "invitations", invitationId);
  const snap = await getDoc(invitationRef);
  if (!snap.exists()) return null;

  const inv = snap.data();

  const workspaceRef = doc(db, "workspaces", inv.workspaceId);
  const workspaceSnap = await getDoc(workspaceRef);

  return {
    id: invitationId,
    ...inv,
    workspaceName: workspaceSnap.exists()
      ? workspaceSnap.data()?.name || "Budget Workspace"
      : "Budget Workspace",
  };
}

export async function acceptInvitation(invitationId, userId, userProfile) {
  const invitationRef = doc(db, "invitations", invitationId);
  const snap = await getDoc(invitationRef);

  if (!snap.exists()) throw new Error("Invitation not found");
  const inv = snap.data();

  // Expiry check
  const expiresMs = inv.expiresAt?.toMillis ? inv.expiresAt.toMillis() : 0;
  if (expiresMs && Date.now() > expiresMs) {
    // mark expired (best effort)
    try {
      await updateDoc(invitationRef, { status: "expired" });
    } catch {}
    throw new Error("Invitation has expired");
  }

  // Status check
  if (inv.status !== "pending") {
    throw new Error("Invitation has already been used or is not valid");
  }

  // Add member
  await createWorkspaceMember(inv.workspaceId, userId, inv.role, userProfile);

  // Mark invitation accepted
  await updateDoc(invitationRef, {
    status: "accepted",
    usedBy: userId,
    acceptedAt: serverTimestamp(),
  });

  return inv.workspaceId;
}

export async function revokeInvitation(invitationId) {
  const invitationRef = doc(db, "invitations", invitationId);
  await deleteDoc(invitationRef);
}

export async function getWorkspaceInvitations(workspaceId) {
  const invitationsRef = collection(db, "invitations");
  const q = query(invitationsRef, where("workspaceId", "==", workspaceId));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateMemberRole(workspaceId, userId, newRole) {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);
  await updateDoc(memberRef, { role: newRole });
}

export async function removeMember(workspaceId, userId) {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);
  await deleteDoc(memberRef);
}

/**
 * ✅ Scalable workspace discovery:
 * uses collectionGroup('members') instead of scanning ALL workspaces.
 *
 * Requires an index? Firestore usually handles this well, but if it asks,
 * create the suggested composite index in the console.
 */
export async function getUserWorkspaces(userId) {
  const q = query(collectionGroup(db, "members"), where("userId", "==", userId));
  const snapshot = await getDocs(q);

  const results = [];
  for (const memberDoc of snapshot.docs) {
    // memberDoc.ref.path = workspaces/{workspaceId}/members/{userId}
    const parts = memberDoc.ref.path.split("/");
    const workspaceId = parts[1]; // ["workspaces", "{workspaceId}", "members", "{userId}"]

    const workspaceRef = doc(db, "workspaces", workspaceId);
    const wsSnap = await getDoc(workspaceRef);

    results.push({
      id: workspaceId,
      role: memberDoc.data()?.role,
      name: wsSnap.exists() ? wsSnap.data()?.name || "My Budget" : "My Budget",
      lastModified: wsSnap.exists() ? wsSnap.data()?.lastModified : null,
      version: wsSnap.exists() ? wsSnap.data()?.version : null,
    });
  }

  // Sort newest first (if lastModified is present)
  results.sort((a, b) => {
    const am = a.lastModified?.toMillis ? a.lastModified.toMillis() : 0;
    const bm = b.lastModified?.toMillis ? b.lastModified.toMillis() : 0;
    return bm - am;
  });

  return results;
}

export async function setWorkspaceName(workspaceId, name) {
  const workspaceRef = doc(db, "workspaces", workspaceId);
  await updateDoc(workspaceRef, { name });
}

export async function updateMemberActivity(workspaceId, userId) {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);
  await updateDoc(memberRef, { lastActive: serverTimestamp() });
}

function generateInvitationCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
