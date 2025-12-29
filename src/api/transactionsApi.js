import { auth, db } from "../firebaseClient";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

function uidOrThrow() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

function txCol(uid, accountId) {
  // per-account transactions
  return collection(db, "users", uid, "accounts", accountId, "transactions");
}

export async function addTransactionsBatch(accountId, rows = [], meta = {}) {
  const uid = uidOrThrow();
  const col = txCol(uid, accountId);

  // simple sequential insert (safe + easy). You can batchWrite later.
  let count = 0;
  for (const r of rows) {
    if (!r) continue;
    const tx = {
      date: r.date || null,              // ideally "YYYY-MM-DD"
      description: r.description || "",
      amount: Number(r.amount) || 0,
      // optional fields you might add later:
      category: r.category || null,
      merchant: r.merchant || null,

      // import metadata:
      importBank: meta.bank || null,
      importFile: meta.filename || null,
      importKind: meta.kind || null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await addDoc(col, tx);
    count++;
  }
  return count;
}

export function subscribeTransactions(accountId, onData, onError) {
  const uid = uidOrThrow();
  const q = query(txCol(uid, accountId), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function updateTransaction(accountId, txId, patch) {
  const uid = uidOrThrow();
  const ref = doc(db, "users", uid, "accounts", accountId, "transactions", txId);
  return updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteTransaction(accountId, txId) {
  const uid = uidOrThrow();
  const ref = doc(db, "users", uid, "accounts", accountId, "transactions", txId);
  return deleteDoc(ref);
}
