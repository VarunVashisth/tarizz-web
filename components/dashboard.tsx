"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileArchive, FolderKanban, Plus, Search, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { Project } from "@/lib/types";
import { Modal } from "./modal";
import { importTarizzProject } from "@/lib/tarizz-archive";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]); const [query, setQuery] = useState("");
  const [searchable, setSearchable] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true); const [modal, setModal] = useState(false); const [error, setError] = useState("");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  const configured = hasSupabaseConfig();
  const load = useCallback(async () => {
    if (!configured) { setLoading(false); return; }
    const supabase = createClient(); const [{ data, error: fetchError }, { data: nodeRows }, { data: documentRows }] = await Promise.all([supabase.from("projects").select("*").order("sort_order"), supabase.from("nodes").select("id,project_id,name"), supabase.from("documents").select("node_id,plain_text")]);
    if (fetchError) setError(fetchError.message); else { const nextProjects = (data || []) as Project[]; const typedNodes = (nodeRows || []) as { id: string; project_id: string; name: string }[]; const typedDocuments = (documentRows || []) as { node_id: string; plain_text: string }[]; const nodeMap = new Map<string, string>(typedNodes.map(item => [item.id, item.project_id])); const index: Record<string, string> = Object.fromEntries(nextProjects.map(project => [project.id, `${project.title} ${project.description}`.toLowerCase()])); for (const item of typedNodes) index[item.project_id] = `${index[item.project_id] || ""} ${item.name.toLowerCase()}`; for (const item of typedDocuments) { const ownerProject = nodeMap.get(item.node_id); if (ownerProject) index[ownerProject] = `${index[ownerProject] || ""} ${item.plain_text.toLowerCase()}`; } setSearchable(index); setProjects(nextProjects); } setLoading(false);
  }, [configured]);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => projects.filter(project => (searchable[project.id] || `${project.title} ${project.description}`.toLowerCase()).includes(query.toLowerCase())), [projects, query, searchable]);
  async function createProject(event: React.FormEvent) {
    event.preventDefault(); setError(""); const supabase = createClient(); const { data: user } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("projects").insert({ owner_id: user.user!.id, title: title.trim(), description: description.trim(), sort_order: projects.length });
    if (insertError) setError(insertError.message); else { setModal(false); setTitle(""); setDescription(""); await load(); }
  }
  async function importFile(file: File) {
    setLoading(true); setError("");
    try { await importTarizzProject(file, createClient()); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
    finally { setLoading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function moveProject(project: Project, direction: -1 | 1) { const index = projects.findIndex(item => item.id === project.id); const other = projects[index + direction]; if (!other) return; const supabase = createClient(); await Promise.all([supabase.from("projects").update({ sort_order: other.sort_order }).eq("id", project.id), supabase.from("projects").update({ sort_order: project.sort_order }).eq("id", other.id)]); await load(); }
  return <><div className="topbar"><div className="search"><Search size={17} /><input className="input" placeholder="Search projects and notes…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="toolbar"><input hidden ref={fileRef} type="file" accept=".tarizz,application/zip" onChange={e => e.target.files?.[0] && void importFile(e.target.files[0])} /><button className="btn" onClick={() => fileRef.current?.click()} disabled={!configured || loading}><Upload size={16} /> {loading ? "Working…" : "Import"}</button><button className="btn btn-primary" onClick={() => setModal(true)} disabled={!configured}><Plus size={16} /> New project</button></div></div><div className="page"><div className="page-head"><div><p className="eyebrow">01 // Your library</p><h1>Projects</h1><p className="subtle">Notes, research, and plans—organized your way.</p><p className="limit-note">Imports: maximum 100 MB compressed, 200 MB expanded, 1,000 files, 500 notes/folders, and 5 attempts per hour.</p></div></div>{!configured && <div className="notice error"><strong>Supabase setup required.</strong> Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and publishable key, then apply both SQL migrations.</div>}{error && <div className="notice error">{error}</div>}<section className="grid">{loading ? [1,2,3].map(x => <div className="skeleton" key={x} />) : shown.map((project, index) => <article className="card project-card" key={project.id}><Link href={`/projects/${project.id}`} style={{ flex: 1 }}><div className="icon-tile"><FolderKanban size={21} /></div><h2>{project.title}</h2><p className="subtle">{project.description || "A quiet space for your notes."}</p></Link><div className="meta"><span>Project {String(index + 1).padStart(2,"0")}</span><span>{new Date(project.updated_at).toLocaleDateString()}</span></div>{!query && <div className="toolbar" style={{ marginTop: 10 }}><button className="tool-btn" aria-label={`Move ${project.title} left`} disabled={index === 0} onClick={() => moveProject(project,-1)}><ArrowLeft size={15} /></button><button className="tool-btn" aria-label={`Move ${project.title} right`} disabled={index === shown.length - 1} onClick={() => moveProject(project,1)}><ArrowRight size={15} /></button></div>}</article>)}{!loading && !shown.length && <div className="empty"><FileArchive size={38} style={{ margin: "0 auto 14px" }} /><strong>{query ? "No matching projects" : "Your first project starts here"}</strong><p>{query ? "Try another search." : "Create a project or import a desktop .tarizz package."}</p></div>}</section></div>{modal && <Modal title="New project" onClose={() => setModal(false)}><form onSubmit={createProject}><div className="field"><label htmlFor="project-title">Project name</label><input autoFocus className="input" id="project-title" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></div><div className="field"><label htmlFor="project-description">Description</label><textarea className="textarea" id="project-description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></div><div className="toolbar" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-primary">Create project</button></div></form></Modal>}</>;
}
