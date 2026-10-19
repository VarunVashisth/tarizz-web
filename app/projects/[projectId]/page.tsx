import { ProtectedShell } from "@/components/protected-shell";
import { ProjectWorkspace } from "@/components/project-workspace";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <ProtectedShell><ProjectWorkspace projectId={projectId} /></ProtectedShell>; }
