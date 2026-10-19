import { redirect } from "next/navigation";
import { AppShell } from "./app-shell";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function ProtectedShell({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseConfig()) return <AppShell email="Setup required">{children}</AppShell>;
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <AppShell email={user.email}>{children}</AppShell>;
}
