"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" | "reset" | "update" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const siteUrl = typeof window === "undefined" ? "" : window.location.origin;

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.replace(new URLSearchParams(window.location.search).get("next") || "/dashboard"); router.refresh();
      } else if (mode === "signup") {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const { error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard` } });
        if (authError) throw authError;
        setMessage("Check your inbox to verify your email, then sign in.");
      } else if (mode === "reset") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/auth/callback?next=/update-password` });
        if (authError) throw authError;
        setMessage("If that account exists, a reset link is on its way.");
      } else {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setMessage("Password updated. Redirecting…");
        setTimeout(() => router.replace("/dashboard"), 700);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${siteUrl}/auth/callback?next=/dashboard` } });
      if (authError) throw authError;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Google sign-in failed."); setBusy(false); }
  }

  const labels = {
    login: ["Welcome back", "Open your private workspace.", "Sign in"],
    signup: ["Create your account", "Your projects, wherever you work.", "Create account"],
    reset: ["Reset your password", "We will email you a secure reset link.", "Send reset link"],
    update: ["Choose a new password", "Use at least eight characters.", "Update password"]
  }[mode];

  return <div className="auth-card">
    <p className="eyebrow">Secure workspace</p><h2>{labels[0]}</h2><p className="subtle">{labels[1]}</p>
    {(mode === "login" || mode === "signup") && <><button className="btn btn-block" onClick={google} disabled={busy}>Continue with Google</button><div className="divider">or use email</div></>}
    <form onSubmit={submit}>
      {mode !== "update" && <div className="field"><label htmlFor="email">Email address</label><input className="input" id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>}
      {mode !== "reset" && <div className="field"><label htmlFor="password">{mode === "update" ? "New password" : "Password"}</label><input className="input" id="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={e => setPassword(e.target.value)} /></div>}
      {(mode === "signup" || mode === "update") && <div className="field"><label htmlFor="confirm">Confirm password</label><input className="input" id="confirm" type="password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} /></div>}
      {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Please wait…" : labels[2]}</button>
    </form>
    {mode === "login" && <p className="subtle"><Link href="/reset-password">Forgot password?</Link><br />New to Tarizz? <Link href="/signup"><strong>Create an account</strong></Link></p>}
    {mode === "signup" && <p className="subtle">Already registered? <Link href="/login"><strong>Sign in</strong></Link></p>}
    {mode === "reset" && <p className="subtle"><Link href="/login"><strong>Back to sign in</strong></Link></p>}
  </div>;
}
