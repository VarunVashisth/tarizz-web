"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileArchive, FolderKanban, Plus, Search, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { Project } from "@/lib/types";
import { Modal } from "./modal";

function ProjectNavigationStatus() {
  const { pending } = useLinkStatus();
  return <span className={`project-open-status ${pending ? "pending" : ""}`}>{pending ? "Opening…" : "Open project →"}</span>;
}

export function Dashboard({ initialProjects, initialError = "" }: { initialProjects: Project[]; initialError?: string }) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState(initialError);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const searchSequence = useRef(0);
  const router = useRouter();
  const configured = hasSupabaseConfig();

  async function refreshProjects() {
    const { data, error: fetchError } = await createClient().from("projects").select("*").order("sort_order");
    if (fetchError) throw fetchError;
    setProjects((data || []) as Project[]);
  }

  useEffect(() => {
    const trimmed = query.trim();
    const sequence = ++searchSequence.current;
    if (!trimmed) {
      setMatchedIds(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error: searchError } = await createClient().rpc("search_project_ids", { p_query: trimmed.slice(0, 100) });
      if (sequence !== searchSequence.current) return;
      if (searchError) {
        setError(searchError.message.includes("search_project_ids") ? "Apply migration 0003_dashboard_performance.sql to enable fast note search." : searchError.message);
        setMatchedIds(new Set());
      } else {
        setMatchedIds(new Set(((data || []) as Array<{ project_id: string }>).map(row => row.project_id)));
      }
      setSearching(false);
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const shown = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return projects;
    if (matchedIds) return projects.filter(project => matchedIds.has(project.id));
    return projects.filter(project => `${project.title} ${project.description}`.toLowerCase().includes(trimmed));
  }, [projects, query, matchedIds]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    const { data, error: insertError } = await createClient().from("projects").insert({
      title: title.trim(),
      description: description.trim(),
      sort_order: projects.length,
    }).select().single();
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const project = data as Project;
    setProjects(current => [...current, project]);
    setModal(false);
    setTitle("");
    setDescription("");
    router.prefetch(`/projects/${project.id}`);
  }

  async function importFile(file: File) {
    setImporting(true);
    setError("");
    try {
      const { importTarizzProject } = await import("@/lib/tarizz-archive");
      await importTarizzProject(file, createClient());
      await refreshProjects();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function moveProject(project: Project, direction: -1 | 1) {
    const index = projects.findIndex(item => item.id === project.id);
    const other = projects[index + direction];
    if (!other) return;
    const previous = projects;
    const next = [...projects];
    next[index] = { ...other, sort_order: project.sort_order };
    next[index + direction] = { ...project, sort_order: other.sort_order };
    setProjects(next);
    const supabase = createClient();
    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      supabase.from("projects").update({ sort_order: other.sort_order }).eq("id", project.id),
      supabase.from("projects").update({ sort_order: project.sort_order }).eq("id", other.id),
    ]);
    if (firstError || secondError) {
      setProjects(previous);
      setError(firstError?.message || secondError?.message || "Could not reorder projects.");
    }
  }

  return <>
    <div className="topbar">
      <div className="search"><Search size={17} /><input className="input" placeholder="Search projects and notes…" value={query} onChange={event => { setQuery(event.target.value); setMatchedIds(null); }} />{searching && <span className="search-progress" aria-label="Searching" />}</div>
      <div className="toolbar"><input hidden ref={fileRef} type="file" accept=".tarizz,application/zip" onChange={event => event.target.files?.[0] && void importFile(event.target.files[0])} /><button className="btn" onClick={() => fileRef.current?.click()} disabled={!configured || importing}><Upload size={16} /> {importing ? "Importing…" : "Import"}</button><button className="btn btn-primary" onClick={() => setModal(true)} disabled={!configured}><Plus size={16} /> New project</button></div>
    </div>
    <div className="page">
      <div className="page-head"><div><p className="eyebrow">01 // Your library</p><h1>Projects</h1><p className="subtle">Notes, research, and plans—organized your way.</p><p className="limit-note">Imports: maximum 100 MB compressed, 200 MB expanded, 1,000 files, 500 notes/folders, and 5 attempts per hour.</p></div></div>
      {!configured && <div className="notice error"><strong>Supabase setup required.</strong> Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and publishable key, then apply all SQL migrations.</div>}
      {error && <div className="notice error">{error}</div>}
      <section className="grid">{shown.map((project, index) => <article className="card project-card" key={project.id}>
        <Link href={`/projects/${project.id}`} className="project-card-link" onMouseEnter={() => router.prefetch(`/projects/${project.id}`)}>
          <div className="icon-tile"><FolderKanban size={21} /></div><h2>{project.title}</h2><p className="subtle">{project.description || "A quiet space for your notes."}</p><ProjectNavigationStatus />
        </Link>
        <div className="meta"><span>Project {String(index + 1).padStart(2, "0")}</span><span>{new Date(project.updated_at).toLocaleDateString()}</span></div>
        {!query && <div className="toolbar project-order"><button className="tool-btn" aria-label={`Move ${project.title} left`} disabled={index === 0} onClick={() => void moveProject(project, -1)}><ArrowLeft size={15} /></button><button className="tool-btn" aria-label={`Move ${project.title} right`} disabled={index === shown.length - 1} onClick={() => void moveProject(project, 1)}><ArrowRight size={15} /></button></div>}
      </article>)}{!shown.length && !searching && <div className="empty"><FileArchive size={38} /><strong>{query ? "No matching projects" : "Your first project starts here"}</strong><p>{query ? "Try another search." : "Create a project or import a desktop .tarizz package."}</p></div>}</section>
    </div>
    {modal && <Modal title="New project" onClose={() => setModal(false)}><form onSubmit={createProject}><div className="field"><label htmlFor="project-title">Project name</label><input autoFocus className="input" id="project-title" required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></div><div className="field"><label htmlFor="project-description">Description</label><textarea className="textarea" id="project-description" maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></div><div className="toolbar" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-primary" disabled={creating}>{creating ? "Creating…" : "Create project"}</button></div></form></Modal>}
  </>;
}
