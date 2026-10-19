"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { AlignCenter, AlignLeft, AlignRight, Bold, Braces, Download, FileDown, Highlighter, ImagePlus, Italic, Link2, List, ListOrdered, Paperclip, Quote, Redo2, RemoveFormatting, Search, Strikethrough, UnderlineIcon, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Attachment, DocumentRecord, ProjectNode } from "@/lib/types";
import { ALLOWED_ATTACHMENT_TYPES, formatBytes, validateAttachment } from "@/lib/upload-policy";
import { optimizeImage } from "@/lib/image-optimization";
import { Modal } from "./modal";
import { downloadBlob } from "@/lib/tarizz-archive";

const lowlight = createLowlight(common);
const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };
type SignedUrl = { path?: string; signedUrl?: string };

function Tool({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={`tool-btn ${active ? "active" : ""}`} title={title} aria-label={title} aria-pressed={active} onClick={onClick}>{children}</button>;
}

function EditorToolbar({ editor, preview, uploading, onLink, onFindReplace, onUpload, onPreview, onPdf }: {
  editor: Editor; preview: boolean; uploading: boolean; onLink: () => void; onFindReplace: () => void; onUpload: () => void; onPreview: () => void; onPdf: () => void;
}) {
  const state = useEditorState({ editor, selector: ({ editor: active }) => ({
    bold: active.isActive("bold"), italic: active.isActive("italic"), underline: active.isActive("underline"), strike: active.isActive("strike"),
    highlight: active.isActive("highlight"), bullets: active.isActive("bulletList"), ordered: active.isActive("orderedList"), quote: active.isActive("blockquote"),
    code: active.isActive("codeBlock"), link: active.isActive("link"), font: active.getAttributes("textStyle").fontFamily || "",
    heading: active.isActive("heading", { level: 1 }) ? "1" : active.isActive("heading", { level: 2 }) ? "2" : active.isActive("heading", { level: 3 }) ? "3" : "0",
  }) });
  return <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
    <div className="tool-group"><Tool title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></Tool><Tool title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></Tool></div>
    <div className="tool-group"><select className="toolbar-select" aria-label="Text style" value={state.heading} onChange={event => { const level = Number(event.target.value); if (!level) editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run(); }}><option value="0">Paragraph</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option></select><select className="toolbar-select font-select" aria-label="Font family" value={state.font} onChange={event => event.target.value ? editor.chain().focus().setFontFamily(event.target.value).run() : editor.chain().focus().unsetFontFamily().run()}><option value="">Editorial serif</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Courier New">Courier</option><option value="Trebuchet MS">Trebuchet</option></select></div>
    <div className="tool-group"><Tool title="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={17} /></Tool><Tool title="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={17} /></Tool><Tool title="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={17} /></Tool><Tool title="Strike" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={17} /></Tool><Tool title="Highlight" active={state.highlight} onClick={() => editor.chain().focus().toggleHighlight({ color: "#fff09a" }).run()}><Highlighter size={17} /></Tool></div>
    <div className="tool-group"><Tool title="Bullet list" active={state.bullets} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17} /></Tool><Tool title="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></Tool><Tool title="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={17} /></Tool><Tool title="Code block" active={state.code} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Braces size={17} /></Tool></div>
    <div className="tool-group"><Tool title="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft size={17} /></Tool><Tool title="Align center" onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter size={17} /></Tool><Tool title="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight size={17} /></Tool><Tool title="Link" active={state.link} onClick={onLink}><Link2 size={17} /></Tool></div>
    <div className="tool-group tool-group-actions"><Tool title="Find and replace" onClick={onFindReplace}><Search size={17} /></Tool><Tool title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={17} /></Tool><Tool title="Upload attachment" onClick={onUpload}>{uploading ? <span className="upload-spinner" /> : <Paperclip size={17} />}</Tool><Tool title="Markdown preview" active={preview} onClick={onPreview}><FileDown size={17} /></Tool><Tool title="Export PDF" onClick={onPdf}><Download size={17} /></Tool></div>
  </div>;
}

export function RichEditor({ node, onRenamed }: { node: ProjectNode; onRenamed: () => void }) {
  const [status, setStatus] = useState("Loading…");
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState(false);
  const [conflict, setConflict] = useState<{ revision: number; content: Record<string, unknown> } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(node.name);
  const revisionRef = useRef(0);
  const loadedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function persist(active: Editor) {
    if (!loadedRef.current) return;
    if (savingRef.current) { queuedSaveRef.current = true; return; }
    savingRef.current = true; queuedSaveRef.current = false; setStatus("Saving…");
    const expected = revisionRef.current;
    const { data, error } = await createClient().rpc("save_document_if_revision", { p_node_id: node.id, p_content_json: active.getJSON(), p_plain_text: active.getText(), p_expected_revision: expected });
    savingRef.current = false;
    if (error) { setStatus(error.message.toLowerCase().includes("rate") ? "Save paused — rate limit" : "Save failed"); return; }
    const result = data?.[0];
    if (!result?.saved) { setConflict({ revision: result.new_revision, content: result.remote_content }); setStatus("Conflict"); return; }
    revisionRef.current = result.new_revision; setRevision(result.new_revision); setStatus("Saved");
    if (queuedSaveRef.current) timer.current = setTimeout(() => void persist(active), 350);
  }

  function scheduleSave(active: Editor) {
    if (!loadedRef.current) return;
    setStatus("Unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(active), 1200);
  }

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [StarterKit.configure({ codeBlock: false }), Underline, Highlight.configure({ multicolor: true }), Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }), Image.configure({ inline: false, allowBase64: false }), TextAlign.configure({ types: ["heading", "paragraph"] }), TextStyle, FontFamily, Placeholder.configure({ placeholder: "Begin writing…" }), CodeBlockLowlight.configure({ lowlight })],
    content: EMPTY,
    onUpdate: ({ editor: active }) => scheduleSave(active),
  });

  const load = useCallback(async () => {
    if (!editor) return;
    loadedRef.current = false;
    const supabase = createClient();
    const [{ data: doc, error }, { data: files }] = await Promise.all([supabase.from("documents").select("*").eq("node_id", node.id).single(), supabase.from("attachments").select("*").eq("node_id", node.id).order("created_at")]);
    if (error) { setStatus("Load failed"); return; }
    const typed = doc as DocumentRecord; const typedFiles = (files || []) as Attachment[];
    revisionRef.current = typed.revision; setRevision(typed.revision); editor.commands.setContent(typed.content_json || EMPTY, { emitUpdate: false }); setAttachments(typedFiles);
    const paths = [...new Set(typedFiles.flatMap(file => [file.storage_path, file.preview_storage_path].filter((path): path is string => Boolean(path))))];
    if (paths.length) { const { data: urls } = await supabase.storage.from("attachments").createSignedUrls(paths, 3600); const typedUrls = (urls || []) as SignedUrl[]; setSignedUrls(Object.fromEntries(typedUrls.filter(item => item.signedUrl).map(item => [item.path || "", item.signedUrl!] as const))); } else setSignedUrls({});
    loadedRef.current = true; setStatus("Saved");
  }, [node.id, editor]);

  useEffect(() => { void load(); return () => { loadedRef.current = false; if (timer.current) clearTimeout(timer.current); }; }, [load]);

  async function rename() { const clean = title.trim(); if (!clean || clean === node.name) return; const { error } = await createClient().from("nodes").update({ name: clean }).eq("id", node.id); if (!error) onRenamed(); }
  function setLink() { const previous = editor?.getAttributes("link").href || ""; const href = prompt("Link URL", previous); if (href === null) return; if (!href) editor?.chain().focus().unsetLink().run(); else editor?.chain().focus().extendMarkRange("link").setLink({ href }).run(); }
  function findReplace() { const find = prompt("Find text"); if (!find || !editor) return; const replacement = prompt("Replace with", "") ?? ""; const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); editor.commands.setContent(editor.getHTML().replace(new RegExp(escaped, "gi"), replacement)); }

  async function upload(source: File) {
    const validation = validateAttachment(source); if (validation) return alert(validation);
    setUploading(true); const supabase = createClient(); const uploadedPaths: string[] = [];
    try {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Please sign in again.");
      const safe = source.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180);
      const optimized = ["image/jpeg", "image/png", "image/webp"].includes(source.type) ? await optimizeImage(source) : null;
      const downloadFile = optimized?.download || source; const storedName = optimized?.download.name.replace(/[^a-zA-Z0-9._ -]/g, "_") || safe;
      const basePath = `${user.id}/${node.id}/${crypto.randomUUID()}`; const path = `${basePath}-${storedName}`; const previewPath = optimized ? `${basePath}-preview.webp` : null;
      const { error: uploadError } = await supabase.storage.from("attachments").upload(path, downloadFile, { contentType: downloadFile.type }); if (uploadError) throw uploadError; uploadedPaths.push(path);
      if (optimized && previewPath) { const { error: previewError } = await supabase.storage.from("attachments").upload(previewPath, optimized.preview, { contentType: "image/webp" }); if (previewError) throw previewError; uploadedPaths.push(previewPath); }
      const { data, error } = await supabase.from("attachments").insert({ owner_id: user.id, node_id: node.id, storage_path: path, preview_storage_path: previewPath, original_filename: storedName, mime_type: downloadFile.type, byte_size: downloadFile.size, preview_byte_size: optimized?.preview.size || null, original_byte_size: optimized?.originalBytes || source.size }).select().single(); if (error) throw error;
      const row = data as Attachment; setAttachments(current => [...current, row]);
      const { data: urls } = await supabase.storage.from("attachments").createSignedUrls(uploadedPaths, 3600); const typedUrls = (urls || []) as SignedUrl[]; const nextUrls = Object.fromEntries(typedUrls.filter(item => item.signedUrl).map(item => [item.path || "", item.signedUrl!] as const)); setSignedUrls(current => ({ ...current, ...nextUrls }));
      const inlineUrl = nextUrls[previewPath || path]; if (inlineUrl && downloadFile.type.startsWith("image/")) editor?.chain().focus().setImage({ src: inlineUrl, alt: storedName }).run();
    } catch (cause) { if (uploadedPaths.length) await supabase.storage.from("attachments").remove(uploadedPaths); alert(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function downloadAttachment(file: Attachment) { const { data, error } = await createClient().storage.from("attachments").download(file.storage_path); if (error) alert(error.message); else downloadBlob(data, file.original_filename); }
  async function removeAttachment(file: Attachment) { if (!confirm(`Remove ${file.original_filename}?`)) return; const supabase = createClient(); const paths = [file.storage_path, file.preview_storage_path].filter((path): path is string => Boolean(path)); const { error } = await supabase.storage.from("attachments").remove(paths); if (!error) { await supabase.from("attachments").delete().eq("id", file.id); setAttachments(current => current.filter(item => item.id !== file.id)); } }
  function exportText(kind: "md" | "txt") { if (!editor) return; const content = kind === "md" ? new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }).turndown(editor.getHTML()) : editor.getText(); downloadBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), `${title}.${kind}`); }
  async function exportPdf() { if (!editor) return; const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ unit: "pt", format: "a4" }); pdf.setFont("times", "bold"); pdf.setFontSize(22); pdf.text(title, 48, 60); pdf.setFont("times", "normal"); pdf.setFontSize(11); const lines = pdf.splitTextToSize(editor.getText(), 500); let y = 88; for (const line of lines) { if (y > 790) { pdf.addPage(); y = 48; } pdf.text(line, 48, y); y += 16; } pdf.save(`${title}.pdf`); }
  async function keepMineAsCopy() { if (!editor) return; const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); const { data: copy, error } = await supabase.from("nodes").insert({ owner_id: user!.id, project_id: node.project_id, parent_id: node.parent_id, type: "document", name: `${title} (conflict copy)`, sort_order: node.sort_order + 1 }).select().single(); if (!error) { await supabase.from("documents").insert({ node_id: copy.id, owner_id: user!.id, content_json: editor.getJSON(), plain_text: editor.getText() }); setConflict(null); setStatus("Saved as copy"); onRenamed(); } }
  function loadRemote() { if (!conflict) return; editor?.commands.setContent(conflict.content, { emitUpdate: false }); revisionRef.current = conflict.revision; setRevision(conflict.revision); setConflict(null); setStatus("Saved"); }

  if (!editor) return <div className="editor-wrap"><div className="skeleton" /></div>;
  return <>
    <div className="editor-head"><div className="editor-title-block"><span className="eyebrow">Document // {node.id.slice(0, 8)}</span><input className="title-input" aria-label="Document title" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} onBlur={rename} /></div><span className="save-state"><span className="status-dot" />{status} · r{revision}</span></div>
    <EditorToolbar editor={editor} preview={preview} uploading={uploading} onLink={setLink} onFindReplace={findReplace} onUpload={() => fileRef.current?.click()} onPreview={() => setPreview(current => !current)} onPdf={exportPdf} />
    <input hidden ref={fileRef} type="file" accept={ALLOWED_ATTACHMENT_TYPES.join(",")} onChange={event => event.target.files?.[0] && void upload(event.target.files[0])} />
    <div className="editor-wrap">{preview ? <article className="tiptap editor-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editor.getHTML()) }} /> : <EditorContent editor={editor} />}</div>
    <section className="attachments"><div className="section-head"><div><span className="eyebrow">Files // Private</span><h3>Attachments</h3></div><div className="toolbar"><button className="btn" onClick={() => exportText("md")}>Markdown</button><button className="btn" onClick={() => exportText("txt")}>Plain text</button><button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}><ImagePlus size={16} /> Add file</button></div></div><p className="limit-note">Images are optimized in your browser: a fast preview is shown here and a higher-quality version (maximum 2560 px) is kept for download. Originals are not uploaded. Other files are limited to 20 MB.</p>{attachments.map(file => { const displayPath = file.preview_storage_path || file.storage_path; const displayUrl = signedUrls[displayPath]; const saved = file.original_byte_size && file.original_byte_size > file.byte_size ? file.original_byte_size - file.byte_size : 0; return <article className="attachment-card" key={file.id}>{displayUrl && file.mime_type.startsWith("image/") && <img src={displayUrl} alt={file.original_filename} loading="lazy" />}{displayUrl && file.mime_type.startsWith("video/") && <video src={displayUrl} controls preload="metadata" />}{displayUrl && file.mime_type === "application/pdf" && <iframe src={displayUrl} title={file.original_filename} loading="lazy" />}<div className="attachment-row"><Paperclip size={16} /><span className="name"><strong>{file.original_filename}</strong><small>{formatBytes(file.byte_size)}{saved > 0 ? ` · ${formatBytes(saved)} smaller than source` : ""}</small></span><button className="btn" onClick={() => downloadAttachment(file)}>Download</button><button className="btn btn-danger" onClick={() => removeAttachment(file)}>Remove</button></div></article>; })}{!attachments.length && <div className="empty compact"><Paperclip size={24} /><strong>No attachments yet</strong><span>Add an image, PDF, video, Word document, or text file.</span></div>}</section>
    {conflict && <Modal title="A newer version exists" onClose={() => {}}><p className="subtle">This note was changed on another machine. Loading it prevents accidental overwriting; saving a copy keeps both versions.</p><div className="toolbar" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={keepMineAsCopy}>Save mine as a copy</button><button className="btn btn-primary" onClick={loadRemote}>Load newer version</button></div></Modal>}
  </>;
}
