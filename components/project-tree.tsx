"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, GitFork, MoreHorizontal } from "lucide-react";
import type { ProjectNode } from "@/lib/types";

export function ProjectTree({ nodes, selected, onSelect, onMenu }: { nodes: ProjectNode[]; selected: string | null; onSelect: (node: ProjectNode) => void; onMenu: (node: ProjectNode) => void }) {
  const roots = nodes.filter(n => !n.parent_id).sort((a,b) => a.sort_order-b.sort_order);
  return <div>{roots.map(node => <TreeItem key={node.id} node={node} all={nodes} selected={selected} onSelect={onSelect} onMenu={onMenu} depth={0} />)}</div>;
}

function TreeItem({ node, all, selected, onSelect, onMenu, depth }: { node: ProjectNode; all: ProjectNode[]; selected: string | null; onSelect: (node: ProjectNode) => void; onMenu: (node: ProjectNode) => void; depth: number }) {
  const children = all.filter(n => n.parent_id === node.id).sort((a,b) => a.sort_order-b.sort_order); const [open, setOpen] = useState(true);
  const Icon = node.type === "folder" ? Folder : node.type === "flowchart" ? GitFork : FileText;
  return <div><div className={`tree-node ${selected === node.id ? "selected" : ""}`} style={{ paddingLeft: 7 + depth * 14 }}>
    {node.type === "folder" ? <button style={{ flex: "none", width: 18 }} aria-label={open ? "Collapse folder" : "Expand folder"} onClick={() => setOpen(x => !x)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span style={{ width: 18 }} />}
    <Icon size={15} /><button onClick={() => node.type === "folder" ? setOpen(x => !x) : onSelect(node)} title={node.name}>{node.name}</button><button style={{ flex: "none" }} aria-label={`Actions for ${node.name}`} onClick={() => onMenu(node)}><MoreHorizontal size={15} /></button>
  </div>{open && children.map(child => <TreeItem key={child.id} node={child} all={all} selected={selected} onSelect={onSelect} onMenu={onMenu} depth={depth + 1} />)}</div>;
}
