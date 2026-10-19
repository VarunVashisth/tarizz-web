export type Project = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type NodeType = "folder" | "document" | "flowchart";

export type ProjectNode = {
  id: string;
  owner_id: string;
  project_id: string;
  parent_id: string | null;
  type: NodeType;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type DocumentRecord = {
  node_id: string;
  owner_id: string;
  content_json: Record<string, unknown>;
  plain_text: string;
  editor_version: number;
  revision: number;
  updated_at: string;
};

export type Attachment = {
  id: string;
  owner_id: string;
  node_id: string;
  storage_path: string;
  preview_storage_path: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  preview_byte_size: number | null;
  original_byte_size: number | null;
  position: string | null;
  created_at: string;
};

export type CalendarTask = {
  id: string;
  owner_id: string;
  task_date: string;
  title: string;
  completed: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  projects?: { title: string } | null;
};
