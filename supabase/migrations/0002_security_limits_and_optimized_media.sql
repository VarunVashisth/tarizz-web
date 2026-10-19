-- Run after 0001_initial.sql. Adds durable rate limits, tighter upload limits,
-- an owner storage quota, and separate optimized preview metadata.

alter table public.attachments
  add column if not exists preview_storage_path text,
  add column if not exists preview_byte_size bigint check (preview_byte_size is null or preview_byte_size between 0 and 20971520),
  add column if not exists original_byte_size bigint check (original_byte_size is null or original_byte_size >= 0);

alter table public.attachments drop constraint if exists attachments_byte_size_check;
alter table public.attachments
  add constraint attachments_byte_size_check check (byte_size between 0 and 20971520);

create table if not exists public.rate_limit_buckets (
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (owner_id, action, window_start)
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit_internal(
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  bucket timestamptz;
  accepted integer;
begin
  if actor is null then return false; end if;
  delete from public.rate_limit_buckets
  where owner_id = actor and window_start < now() - interval '2 days';
  bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_buckets(owner_id, action, window_start, request_count)
  values (actor, p_action, bucket, 1)
  on conflict (owner_id, action, window_start) do update
    set request_count = public.rate_limit_buckets.request_count + 1
    where public.rate_limit_buckets.request_count < p_limit
  returning request_count into accepted;
  return accepted is not null;
end;
$$;

revoke all on function public.consume_rate_limit_internal(text, integer, integer) from public, anon, authenticated;

create or replace function public.consume_upload_slot() returns boolean
language sql security definer set search_path = public, pg_temp
as $$ select public.consume_rate_limit_internal('storage-upload', 60, 3600); $$;

create or replace function public.consume_import_slot() returns boolean
language sql security definer set search_path = public, pg_temp
as $$ select public.consume_rate_limit_internal('project-import', 5, 3600); $$;

create or replace function public.can_store_attachment(p_incoming_bytes bigint) returns boolean
language sql stable security definer set search_path = public, storage, pg_temp
as $$
  select auth.uid() is not null
    and p_incoming_bytes between 0 and 20971520
    and coalesce((
      select sum(coalesce((o.metadata->>'size')::bigint, 0))
      from storage.objects o
      where o.bucket_id = 'attachments'
        and (storage.foldername(o.name))[1] = auth.uid()::text
    ), 0) + p_incoming_bytes <= 524288000;
$$;

grant execute on function public.consume_upload_slot() to authenticated;
grant execute on function public.consume_import_slot() to authenticated;
grant execute on function public.can_store_attachment(bigint) to authenticated;

create or replace function public.enforce_insert_rate_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.consume_rate_limit_internal(TG_ARGV[0], TG_ARGV[1]::integer, TG_ARGV[2]::integer) then
    raise exception 'Rate limit exceeded for %. Please wait and try again.', TG_ARGV[0] using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_insert_rate_limit on public.projects;
create trigger projects_insert_rate_limit before insert on public.projects for each row execute function public.enforce_insert_rate_limit('project-create', '30', '3600');
drop trigger if exists nodes_insert_rate_limit on public.nodes;
create trigger nodes_insert_rate_limit before insert on public.nodes for each row execute function public.enforce_insert_rate_limit('node-create', '600', '3600');
drop trigger if exists tasks_insert_rate_limit on public.calendar_tasks;
create trigger tasks_insert_rate_limit before insert on public.calendar_tasks for each row execute function public.enforce_insert_rate_limit('task-create', '300', '3600');
drop trigger if exists attachments_insert_rate_limit on public.attachments;
create trigger attachments_insert_rate_limit before insert on public.attachments for each row execute function public.enforce_insert_rate_limit('attachment-create', '60', '3600');

create or replace function public.save_document_if_revision(
  p_node_id uuid,
  p_content_json jsonb,
  p_plain_text text,
  p_expected_revision integer
) returns table(saved boolean, new_revision integer, remote_content jsonb, remote_plain_text text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_revision integer;
begin
  if not public.consume_rate_limit_internal('document-save', 240, 3600) then
    raise exception 'Save rate limit exceeded. Please wait before saving again.' using errcode = 'P0001';
  end if;
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

update storage.buckets
set file_size_limit = 20971520
where id = 'attachments';

drop policy if exists "owners upload attachment objects" on storage.objects;
create policy "owners upload attachment objects" on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_store_attachment(coalesce((metadata->>'size')::bigint, 0))
  and public.consume_upload_slot()
);

create index if not exists rate_limit_cleanup_idx on public.rate_limit_buckets(window_start);

