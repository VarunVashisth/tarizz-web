import { ProtectedShell } from "@/components/protected-shell";
import { ProjectWorkspace } from "@/components/project-workspace";
import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectNode } from "@/lib/types";

type WorkspacePayload = { project: Project; nodes: ProjectNode[] };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_project_workspace", { p_project_id: projectId });
  return <ProtectedShell><ProjectWorkspace projectId={projectId} initialWorkspace={(data as unknown as WorkspacePayload | null) || null} /></ProtectedShell>;
}
