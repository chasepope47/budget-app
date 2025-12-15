// src/FirebaseAuthProvider.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
} from "firebase/auth";

const AuthContext = createContext(null);

export function FirebaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  async function signInWithEmail(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signUpWithEmail(email, password) {
    return await createUserWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    await fbSignOut(auth);
    setUser(null);
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, signInWithEmail, signUpWithEmail, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useFirebaseAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useFirebaseAuth must be used inside FirebaseAuthProvider");
  return ctx;
}
