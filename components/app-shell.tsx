"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, CalendarDays, LayoutGrid, LogOut, Settings } from "lucide-react";
import { Brand } from "./brand";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "./theme-toggle";

const links = [{ href: "/dashboard", label: "Projects", Icon: LayoutGrid }, { href: "/calendar", label: "Calendar", Icon: CalendarDays }, { href: "/settings", label: "Settings", Icon: Settings }];

export function AppShell({ children, email }: { children: React.ReactNode; email?: string }) {
  const path = usePathname(); const router = useRouter();
  async function signOut() { await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }
  return <div className="app-shell"><aside className="sidebar"><div className="sidebar-brand-row"><Brand /><ThemeToggle /></div><nav className="nav">{links.map(({ href, label, Icon }, index) => <Link href={href} key={href} className={path.startsWith(href) ? "active" : ""}><span className="nav-index">0{index + 1}</span><Icon size={18} /><span>{label}</span></Link>)}</nav><div className="sidebar-foot"><div className="vault-owner"><BookOpen size={16} /><span>{email || "Your vault"}</span></div><button className="btn btn-ghost" onClick={signOut}><LogOut size={16} /><span>Sign out</span></button></div></aside><main className="main">{children}</main></div>;
}
