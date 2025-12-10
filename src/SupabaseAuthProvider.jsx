// SupabaseAuthProvider.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function SupabaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function getInitialSession() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Error getting initial session:", error);
      }

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

  async function signInWithEmail(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // After they click the confirm email link,
      // Supabase will redirect them back here:
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) throw error;
  return data; // so the UI can show a "check your email" message if you want
}

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    }
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