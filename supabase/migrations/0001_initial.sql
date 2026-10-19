create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.node_type as enum ('folder', 'document', 'flowchart');

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid,
  type public.node_type not null,
  name text not null check (char_length(name) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id),
  unique (id, project_id, owner_id),
  foreign key (parent_id, project_id, owner_id) references public.nodes(id, project_id, owner_id) on delete cascade
);

create table public.documents (
  node_id uuid primary key references public.nodes(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  plain_text text not null default '',
  editor_version integer not null default 1,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0 and byte_size <= 26214400),
  position text,
  created_at timestamptz not null default now()
);

create table public.calendar_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_date date not null,
  title text not null check (char_length(title) between 1 and 300),
  completed boolean not null default false,
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_sort_idx on public.projects(owner_id, sort_order);
create index nodes_project_parent_sort_idx on public.nodes(project_id, parent_id, sort_order);
create index documents_owner_search_idx on public.documents using gin (to_tsvector('english', plain_text));
create index attachments_node_idx on public.attachments(node_id);
create index calendar_tasks_owner_date_idx on public.calendar_tasks(owner_id, task_date);

alter table public.projects enable row level security;
alter table public.nodes enable row level security;
alter table public.documents enable row level security;
alter table public.attachments enable row level security;
alter table public.calendar_tasks enable row level security;

create policy "owners manage projects" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage nodes" on public.nodes for all
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (select 1 from public.projects p where p.id = nodes.project_id and p.owner_id = auth.uid())
);
create policy "owners manage documents" on public.documents for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and exists (select 1 from public.nodes n where n.id = documents.node_id and n.owner_id = auth.uid()));
create policy "owners manage attachments" on public.attachments for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and exists (select 1 from public.nodes n where n.id = attachments.node_id and n.owner_id = auth.uid()));
create policy "owners manage calendar tasks" on public.calendar_tasks for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and (calendar_tasks.project_id is null or exists (select 1 from public.projects p where p.id = calendar_tasks.project_id and p.owner_id = auth.uid())));

create or replace function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger nodes_touch before update on public.nodes for each row execute function public.touch_updated_at();
create trigger calendar_tasks_touch before update on public.calendar_tasks for each row execute function public.touch_updated_at();

create or replace function public.save_document_if_revision(
  p_node_id uuid,
  p_content_json jsonb,
  p_plain_text text,
  p_expected_revision integer
) returns table(saved boolean, new_revision integer, remote_content jsonb, remote_plain_text text)
language plpgsql security invoker set search_path = public as $$
declare current_revision integer;
begin
  select revision into current_revision from documents where node_id = p_node_id and owner_id = auth.uid() for update;
  if current_revision is null then raise exception 'Document not found'; end if;
  if current_revision <> p_expected_revision then
    return query select false, d.revision, d.content_json, d.plain_text from documents d where d.node_id = p_node_id;
    return;
  end if;
  update documents set content_json = p_content_json, plain_text = p_plain_text,
    revision = revision + 1, updated_at = now() where node_id = p_node_id and owner_id = auth.uid();
  return query select true, d.revision, d.content_json, d.plain_text from documents d where d.node_id = p_node_id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400,
  array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "owners read attachment objects" on storage.objects for select to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners upload attachment objects" on storage.objects for insert to authenticated
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners update attachment objects" on storage.objects for update to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete attachment objects" on storage.objects for delete to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
