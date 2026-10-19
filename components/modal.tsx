"use client";
import { X } from "lucide-react";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><h2>{title}</h2><button className="tool-btn" aria-label="Close" onClick={onClose}><X size={19} /></button></div>{children}</section></div>;
}
