import React from "react";

function AuthScreen({ onSignIn, onSignUp, onResetPassword, loading }) {
  const [mode, setMode] = React.useState("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState(null);
  const [info, setInfo] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [resetSubmitting, setResetSubmitting] = React.useState(false);

  async function handleForgotPasswordClick() {
    setError(null);
    setInfo(null);

    if (!email) {
      setError(
        "Please enter your email first, then click 'Forgot password?'."
      );
      return;
    }

    if (!onResetPassword) return;
    setResetSubmitting(true);

    try {
      await onResetPassword(email);
      setInfo(
        "If an account exists with that email, a reset link has been sent. Check your inbox."
      );
    } catch (err) {
      setError(err.message || "Failed to start password reset.");
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "signin") {
        await onSignIn(email, password);
      } else {
        const result = await onSignUp(email, password);
        const user = result?.user || null;
        const session = result?.session || null;

        if (user && !session) {
          setInfo(
            "Account created! Check your email and click the confirmation link."
          );
        } else {
          setInfo("Account created!");
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-sm text-slate-400">Checking session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-black/30 p-8 shadow-[0_20px_50px_rgba(8,8,12,0.8)]">
        <div className="space-y-2 text-center">
          <p className="text-xs tracking-[0.4em] uppercase text-cyan-300">
            Budget Center
          </p>
          <h1 className="text-2xl font-semibold text-white">Access portal</h1>
          <p className="text-sm text-slate-400">
            {mode === "signin"
              ? "Sign in to load your encrypted budgets."
              : "Create an account to sync your budgets and goals across devices."}
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-full bg-white/5 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-full py-2 font-medium transition ${
              mode === "signin"
                ? "bg-cyan-500 text-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-full py-2 font-medium transition ${
              mode === "signup"
                ? "bg-cyan-500 text-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Create account
          </button>
        </div>

        {error && (
          <div className="rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded border border-emerald-400/60 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              placeholder="you@email.com"
              autoComplete="email"
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-300">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              placeholder="••••••••"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-cyan-500 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
          >
            {submitting
              ? "Please wait..."
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>

        <div className="text-center text-sm text-slate-400">
          <button
            type="button"
            className="font-medium text-cyan-300 hover:text-cyan-200 disabled:opacity-60"
            onClick={handleForgotPasswordClick}
            disabled={resetSubmitting}
          >
            {resetSubmitting ? "Sending reset link..." : "Forgot password?"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
