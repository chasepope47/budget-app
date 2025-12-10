// SupabaseAuthProvider.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function SupabaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // On mount, check current session and subscribe to changes
  useEffect(() => {
    let ignore = false;

    async function getInitialSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!ignore) {
        setUser(session?.user ?? null);
        setAuthLoading(false);
      }
    }

    getInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ignore) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, []);

  // Helpers for email/password login
  async function signInWithEmail(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

  async function signUpWithEmail(email, password) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value = {
    user,
    authLoading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useSupabaseAuth must be used inside SupabaseAuthProvider");
  }
  return ctx;
}
