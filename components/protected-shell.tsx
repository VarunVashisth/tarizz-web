import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "./app-shell";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function ProtectedShell({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseConfig()) return <AppShell email="Setup required">{children}</AppShell>;
  const encodedEmail = (await headers()).get("x-tarizz-user-email");
  if (!encodedEmail) redirect("/login");
  return <AppShell email={decodeURIComponent(encodedEmail)}>{children}</AppShell>;
}
