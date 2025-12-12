// SupabaseAuthProvider.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);
const isDev = import.meta.env.DEV;
const logDev = (...args) => {
  if (isDev) {
    console.log(...args);
  }
};

export function SupabaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function getInitialSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Error getting initial session:", error);
          // Clear any corrupted session data
          await supabase.auth.signOut();
        }

        if (!ignore) {
          setUser(session?.user ?? null);
          setAuthLoading(false);
        }
      } catch (err) {
        console.error("Failed to initialize auth:", err);
        if (!ignore) {
          setUser(null);
          setAuthLoading(false);
        }
      }
    }

    getInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      logDev("Auth state changed:", event);
      
      if (!ignore) {
        setUser(session?.user ?? null);
      }

      // Handle token refresh errors by signing out
      if (event === "TOKEN_REFRESHED") {
        logDev("Token refreshed successfully");
      } else if (event === "SIGNED_OUT") {
        setUser(null);
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
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) throw error;
    return data;
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
      }
      // Always clear user state locally even if API call fails
      setUser(null);
    } catch (err) {
      console.error("Sign out failed:", err);
      setUser(null);
    }
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }

  const value = {
    user,
    authLoading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
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
