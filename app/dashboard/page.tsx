import { ProtectedShell } from "@/components/protected-shell";
import { Dashboard } from "@/components/dashboard";
export default function DashboardPage() { return <ProtectedShell><Dashboard /></ProtectedShell>; }
