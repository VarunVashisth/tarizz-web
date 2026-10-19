import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment, DocumentRecord, Project, ProjectNode } from "./types";
import { UPLOAD_LIMITS, formatBytes } from "./upload-policy";

const MAX_FILES = UPLOAD_LIMITS.importFiles;
const MAX_BYTES = UPLOAD_LIMITS.importBytes;

type LegacyContent = { content?: string; tags?: Record<string, string[]>; formatting?: unknown[] } | string | null;
type LegacyMedia = { archive_path: string; media_type?: string; original_filename?: string; position_index?: string; sha256?: string };
type LegacyNode = { source_id: string | number; parent_source_id?: string | number | null; node_type: "folder" | "subpage" | "flowchart"; name: string; content?: LegacyContent; media?: LegacyMedia[] };
type Manifest = { format: string; version: number; project: { title?: string; description?: string }; nodes: LegacyNode[] };
type TiptapMark = { type: string; attrs?: Record<string, unknown> };
type TiptapNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: TiptapMark[]; content?: TiptapNode[] };
type ExportNode = { source_id?: number; parent_source_id?: number | null; node_type: "folder" | "subpage" | "flowchart"; name: string; content: ReturnType<typeof tiptapToLegacy> | null; media: Array<{ archive_path: string; media_type: string; original_filename: string; position_index: string; sha256: string }> };

function safeArchivePath(name: string) {
  const normalized = name.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

function indexToOffset(text: string, index: string) {
  const [lineText, columnText] = String(index).split(".");
  const line = Math.max(1, Number(lineText) || 1); const column = Math.max(0, Number(columnText) || 0);
  const lines = text.split("\n"); let offset = 0;
  for (let i = 0; i < Math.min(line - 1, lines.length); i++) offset += lines[i].length + 1;
  return Math.min(text.length, offset + column);
}

function marksAt(text: string, tags: Record<string, string[]>, offset: number) {
  const marks: Array<Record<string, unknown>> = [];
  for (const [tag, ranges] of Object.entries(tags || {})) {
    let active = false;
    for (let i = 0; i + 1 < ranges.length; i += 2) {
      if (indexToOffset(text, ranges[i]) <= offset && offset < indexToOffset(text, ranges[i + 1])) { active = true; break; }
    }
    if (!active) continue;
    if (tag === "bold") marks.push({ type: "bold" });
    else if (tag === "italic") marks.push({ type: "italic" });
    else if (tag === "underline") marks.push({ type: "underline" });
    else if (tag === "strikethrough") marks.push({ type: "strike" });
    else if (tag.includes("highlight")) marks.push({ type: "highlight", attrs: { color: "#f5df72" } });
    else if (tag.startsWith("font_")) marks.push({ type: "textStyle", attrs: { fontFamily: tag.slice(5).replaceAll("_", " ") } });
  }
  return marks;
}

export function legacyToTiptap(input: LegacyContent): Record<string, unknown> {
  if (!input) return { type: "doc", content: [{ type: "paragraph" }] };
  const text = typeof input === "string" ? input : input.content || "";
  const tags = typeof input === "string" ? {} : input.tags || {};
  let absolute = 0;
  const paragraphs = text.split("\n").map(line => {
    const runs: Array<Record<string, unknown>> = []; let current = ""; let currentMarks = ""; let markValue: Array<Record<string, unknown>> = [];
    for (let i = 0; i < line.length; i++) {
      const nextMarks = marksAt(text, tags, absolute + i); const key = JSON.stringify(nextMarks);
      if (i && key !== currentMarks) { runs.push({ type: "text", text: current, ...(markValue.length ? { marks: markValue } : {}) }); current = ""; }
      current += line[i]; currentMarks = key; markValue = nextMarks;
    }
    if (current) runs.push({ type: "text", text: current, ...(markValue.length ? { marks: markValue } : {}) });
    absolute += line.length + 1;
    const trimmed = line.trim(); const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) return { type: "heading", attrs: { level: heading[1].length }, content: [{ type: "text", text: heading[2] }] };
    return { type: "paragraph", ...(runs.length ? { content: runs } : {}) };
  });
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}

function renderNode(node: TiptapNode, state: { text: string; tags: Record<string, string[]>; line: number; col: number }, inherited: string[] = []) {
  if (node.type === "text") {
    const start = `${state.line}.${state.col}`; const value = String(node.text || ""); state.text += value;
    const lines = value.split("\n"); if (lines.length > 1) { state.line += lines.length - 1; state.col = lines.at(-1)!.length; } else state.col += value.length;
    const end = `${state.line}.${state.col}`;
    const markNames = [...inherited, ...(node.marks || []).map((mark: TiptapMark) => mark.type === "strike" ? "strikethrough" : mark.type === "textStyle" && mark.attrs?.fontFamily ? `font_${String(mark.attrs.fontFamily).replaceAll(" ", "_")}` : mark.type)];
    for (const mark of markNames.filter((x: string) => ["bold","italic","underline","strikethrough","highlight"].includes(x) || x.startsWith("font_"))) (state.tags[mark] ||= []).push(start, end);
    return;
  }
  if (node.type === "heading") { const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1; const prefix = `${"#".repeat(level)} `; state.text += prefix; state.col += prefix.length; }
  if (node.type === "codeBlock") inherited = [...inherited, "code_block"];
  (node.content || []).forEach((child: TiptapNode) => renderNode(child, state, inherited));
  if (["paragraph","heading","blockquote","codeBlock","listItem"].includes(node.type)) { state.text += "\n"; state.line++; state.col = 0; }
}

export function tiptapToLegacy(content: Record<string, unknown>) {
  const state = { text: "", tags: {} as Record<string, string[]>, line: 1, col: 0 };
  renderNode(content as unknown as TiptapNode, state);
  return { content: state.text.replace(/\n$/, ""), tags: state.tags, formatting: [] };
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}

function cleanFilename(name: string) { return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "attachment"; }
function mediaMime(media: LegacyMedia) {
  const extension = media.archive_path.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" };
  return byExtension[extension || ""] || (media.media_type === "image" ? "image/png" : media.media_type === "video" ? "video/mp4" : media.media_type === "pdf" ? "application/pdf" : "text/plain");
}

export async function importTarizzProject(file: File, supabase: SupabaseClient) {
  if (file.size > MAX_BYTES) throw new Error(`This project is larger than the ${formatBytes(MAX_BYTES)} web import limit.`);
  const zip = await JSZip.loadAsync(file); const entries = Object.values(zip.files);
  if (entries.length > MAX_FILES) throw new Error("This package contains too many files.");
  if (entries.some(entry => !safeArchivePath(entry.name))) throw new Error("The package contains an unsafe path.");
  const expandedBytes = entries.reduce((total, entry) => total + Number((entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0);
  if (expandedBytes > UPLOAD_LIMITS.importExpandedBytes) throw new Error(`The expanded package is larger than the ${formatBytes(UPLOAD_LIMITS.importExpandedBytes)} safety limit.`);
  const manifestEntry = zip.file("manifest.json"); if (!manifestEntry) throw new Error("manifest.json is missing.");
  const manifest = JSON.parse(await manifestEntry.async("text")) as Manifest;
  if (manifest.format !== "tarizz-project" || manifest.version !== 1 || !Array.isArray(manifest.nodes)) throw new Error("Unsupported Tarizz package.");
  if (manifest.nodes.length > UPLOAD_LIMITS.importNodes) throw new Error(`A project can contain at most ${UPLOAD_LIMITS.importNodes} nodes when imported.`);
  const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Please sign in before importing.");
  const { data: importAllowed, error: limitError } = await supabase.rpc("consume_import_slot");
  if (limitError || !importAllowed) throw new Error("Import limit reached. You can start up to 5 imports per hour.");
  const { data: project, error: projectError } = await supabase.from("projects").insert({ owner_id: user.id, title: String(manifest.project?.title || "Imported project").slice(0,120), description: String(manifest.project?.description || "").slice(0,2000) }).select().single();
  if (projectError) throw projectError;
  const uploaded: string[] = [];
  try {
    const idMap = new Map<string | number, string>(); const pending = [...manifest.nodes]; let guard = 0;
    while (pending.length && guard++ <= manifest.nodes.length + 1) {
      let progressed = false;
      for (const legacy of [...pending]) {
        if (legacy.parent_source_id != null && !idMap.has(legacy.parent_source_id)) continue;
        const type = legacy.node_type === "subpage" ? "document" : legacy.node_type;
        const { data: node, error } = await supabase.from("nodes").insert({ owner_id: user.id, project_id: project.id, parent_id: legacy.parent_source_id == null ? null : idMap.get(legacy.parent_source_id), type, name: String(legacy.name || "Untitled").slice(0,120) }).select().single();
        if (error) throw error; idMap.set(legacy.source_id, node.id);
        if (type !== "folder") {
          const content = legacyToTiptap(legacy.content || null); const plain = typeof legacy.content === "string" ? legacy.content : legacy.content?.content || "";
          const { error: docError } = await supabase.from("documents").insert({ node_id: node.id, owner_id: user.id, content_json: content, plain_text: plain }); if (docError) throw docError;
        }
        for (const media of legacy.media || []) {
          const entry = zip.file(media.archive_path); if (!entry) throw new Error(`Missing media: ${media.archive_path}`);
          const buffer = await entry.async("arraybuffer"); if (buffer.byteLength > UPLOAD_LIMITS.attachmentBytes) throw new Error(`${media.original_filename || media.archive_path} is larger than the ${formatBytes(UPLOAD_LIMITS.attachmentBytes)} attachment limit.`); if (media.sha256 && await sha256(buffer) !== media.sha256) throw new Error(`Checksum failed: ${media.original_filename || media.archive_path}`);
          const filename = cleanFilename(media.original_filename || media.archive_path.split("/").pop() || "attachment"); const path = `${user.id}/${node.id}/${crypto.randomUUID()}-${filename}`;
          const mime = mediaMime(media); const { error: uploadError } = await supabase.storage.from("attachments").upload(path, buffer, { contentType: mime }); if (uploadError) throw uploadError; uploaded.push(path);
          const { error: attachmentError } = await supabase.from("attachments").insert({ owner_id: user.id, node_id: node.id, storage_path: path, original_filename: filename, mime_type: mime, byte_size: buffer.byteLength, position: media.position_index || null }); if (attachmentError) throw attachmentError;
        }
        pending.splice(pending.indexOf(legacy), 1); progressed = true;
      }
      if (!progressed) throw new Error("The project tree has missing or circular parents.");
    }
    return project.id as string;
  } catch (error) {
    if (uploaded.length) await supabase.storage.from("attachments").remove(uploaded);
    await supabase.from("projects").delete().eq("id", project.id);
    throw error;
  }
}

export async function exportTarizzProject(projectId: string, supabase: SupabaseClient) {
  const [{ data: project, error: pError }, { data: nodes, error: nError }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(), supabase.from("nodes").select("*").eq("project_id", projectId).order("sort_order")
  ]); if (pError) throw pError; if (nError) throw nError;
  const typedNodes = (nodes || []) as ProjectNode[]; const nodeIds = typedNodes.map(n => n.id);
  const [{ data: docs }, { data: attachments }] = nodeIds.length ? await Promise.all([
    supabase.from("documents").select("*").in("node_id", nodeIds), supabase.from("attachments").select("*").in("node_id", nodeIds)
  ]) : [{ data: [] }, { data: [] }];
  const docMap = new Map(((docs || []) as DocumentRecord[]).map(d => [d.node_id, d])); const attachmentRows = (attachments || []) as Attachment[];
  const zip = new JSZip(); const sourceIds = new Map(typedNodes.map((node, i) => [node.id, i + 1])); const manifestNodes: ExportNode[] = [];
  for (const node of typedNodes) {
    const item: ExportNode = { source_id: sourceIds.get(node.id), parent_source_id: node.parent_id ? sourceIds.get(node.parent_id) : null, node_type: node.type === "document" ? "subpage" : node.type, name: node.name, content: node.type === "folder" ? null : tiptapToLegacy(docMap.get(node.id)?.content_json || { type: "doc", content: [{ type: "paragraph" }] }), media: [] };
    const own = attachmentRows.filter(a => a.node_id === node.id);
    for (let i = 0; i < own.length; i++) {
      const attachment = own[i]; const { data, error } = await supabase.storage.from("attachments").download(attachment.storage_path); if (error) throw error;
      const bytes = await data.arrayBuffer(); const archivePath = `media/${sourceIds.get(node.id)}_${i}_${cleanFilename(attachment.original_filename)}`; zip.file(archivePath, bytes);
      item.media.push({ archive_path: archivePath, media_type: attachment.mime_type.startsWith("image/") ? "image" : attachment.mime_type.startsWith("video/") ? "video" : attachment.mime_type === "application/pdf" ? "pdf" : "doc", original_filename: attachment.original_filename, position_index: attachment.position || "1.0", sha256: await sha256(bytes) });
    }
    manifestNodes.push(item);
  }
  zip.file("manifest.json", JSON.stringify({ format: "tarizz-project", version: 1, project: { title: (project as Project).title, description: (project as Project).description }, nodes: manifestNodes }, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function exportProjectPdf(projectId: string, supabase: SupabaseClient) {
  const [{ data: project, error: projectError }, { data: nodes, error: nodeError }] = await Promise.all([
    supabase.from("projects").select("title,description").eq("id", projectId).single(),
    supabase.from("nodes").select("id,parent_id,type,name,sort_order").eq("project_id", projectId).order("sort_order")
  ]);
  if (projectError) throw projectError; if (nodeError) throw nodeError;
  const rows = (nodes || []) as Pick<ProjectNode, "id" | "parent_id" | "type" | "name" | "sort_order">[]; const ids = rows.map(row => row.id);
  const { data: docs } = ids.length ? await supabase.from("documents").select("node_id,plain_text").in("node_id", ids) : { data: [] as Array<{ node_id: string; plain_text: string }> };
  const textByNode = new Map((docs || []).map(row => [row.node_id, row.plain_text])); const children = new Map<string | null, typeof rows>();
  for (const row of rows) { const bucket = children.get(row.parent_id) || []; bucket.push(row); children.set(row.parent_id, bucket); }
  const ordered: Array<{ node: typeof rows[number]; depth: number }> = []; const walk = (parent: string | null, depth: number) => { for (const node of children.get(parent) || []) { ordered.push({ node, depth }); walk(node.id, depth + 1); } }; walk(null, 0);
  const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ unit: "pt", format: "a4" }); let y = 58;
  const write = (text: string, size: number, style: "normal" | "bold" = "normal", indent = 0) => { pdf.setFont("times", style); pdf.setFontSize(size); const lines = pdf.splitTextToSize(text || " ", 500 - indent); for (const line of lines) { if (y > 790) { pdf.addPage(); y = 48; } pdf.text(line, 48 + indent, y); y += size * 1.42; } };
  write(project.title, 25, "bold"); if (project.description) write(project.description, 11); y += 16;
  for (const { node, depth } of ordered) { write(`${node.type === "folder" ? "Folder: " : ""}${node.name}`, Math.max(13, 18 - depth), "bold", Math.min(depth * 14, 56)); if (node.type === "document") { write(textByNode.get(node.id) || "No content", 10.5, "normal", Math.min(depth * 14, 56)); y += 10; } if (node.type === "flowchart") write("Preserved Tarizz Desktop flowchart", 10, "normal", Math.min(depth * 14, 56)); }
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
