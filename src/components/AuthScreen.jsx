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
    return <div className="text-slate-200">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      {/* ...your existing login JSX here (buttons, inputs, messages)... */}
    </div>
  );
}

export default AuthScreen;
