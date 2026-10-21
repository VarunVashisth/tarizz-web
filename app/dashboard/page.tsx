import { ProtectedShell } from "@/components/protected-shell";
import { Dashboard } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("*").order("sort_order");
  return <ProtectedShell><Dashboard initialProjects={(data || []) as Project[]} initialError={error?.message || ""} /></ProtectedShell>;
}
