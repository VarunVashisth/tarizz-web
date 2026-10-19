import Link from "next/link";
import { ChevronRight } from "lucide-react";
export function Topbar({ title, parent }: { title: string; parent?: { label: string; href: string } }) {
  return <header className="topbar"><div style={{ display: "flex", alignItems: "center", gap: 8 }}>{parent && <><Link href={parent.href} className="subtle">{parent.label}</Link><ChevronRight size={15} /></>}<strong>{title}</strong></div><span className="pill">Private workspace</span></header>;
}
