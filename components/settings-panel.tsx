"use client";

import { useState } from "react";
import { Download, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/types";
import { downloadBlob, exportTarizzProject } from "@/lib/tarizz-archive";
import { Topbar } from "./topbar";

export function SettingsPanel() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function exportAll() { setBusy(true); setMessage(""); try { const supabase = createClient(); const { data, error } = await supabase.from("projects").select("*").order("sort_order"); if (error) throw error; const zip = new JSZip(); for (const project of (data || []) as Project[]) zip.file(`${project.title.replace(/[^a-z0-9 _-]/gi,"_")}.tarizz`, await exportTarizzProject(project.id, supabase)); downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `tarizz-backup-${new Date().toISOString().slice(0,10)}.zip`); setMessage("Backup downloaded. Store it somewhere private."); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Backup failed."); } finally { setBusy(false); } }
  async function resetPassword() { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user?.email) return; const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/auth/callback?next=/update-password` }); setMessage(error ? error.message : "Password-reset email sent."); }
  async function signOutEverywhere() { await createClient().auth.signOut({ scope: "global" }); window.location.assign("/login"); }
  return <><Topbar title="Settings" /><div className="page"><div className="page-head"><div><p className="eyebrow">Account and data</p><h1>Keep control.</h1><p className="subtle">Back up your projects and manage access to your account.</p></div></div>{message && <div className="notice">{message}</div>}<div className="settings-grid"><section className="card"><div className="icon-tile"><Download /></div><h2>Export everything</h2><p className="subtle">Download every project as a collection of desktop-compatible .tarizz files. These files contain readable content, so store them privately.</p><button className="btn btn-primary" disabled={busy} onClick={exportAll}>{busy ? "Preparing…" : "Download backup"}</button></section><section className="card"><div className="icon-tile"><KeyRound /></div><h2>Password</h2><p className="subtle">Send a secure password-reset link to your verified email address.</p><button className="btn" onClick={resetPassword}>Send reset email</button></section><section className="card"><div className="icon-tile"><ShieldCheck /></div><h2>Privacy model</h2><p className="subtle">Your records are protected by Supabase authentication, private storage, HTTPS, and database row-level security. This release is not zero-knowledge encrypted.</p></section><section className="card"><div className="icon-tile"><LogOut /></div><h2>Other devices</h2><p className="subtle">End every active Tarizz web session, including this one.</p><button className="btn btn-danger" onClick={signOutEverywhere}>Sign out everywhere</button></section></div></div></>;
}
