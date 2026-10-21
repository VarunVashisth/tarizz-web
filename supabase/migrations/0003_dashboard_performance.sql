-- Run after 0002_security_limits_and_optimized_media.sql.
-- Keeps initial dashboard/project requests small and lets PostgreSQL perform search.

create or replace function public.search_project_ids(p_query text)
returns table(project_id uuid)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select matches.project_id from (
    select p.id as project_id
    from public.projects p
    where p.owner_id = auth.uid()
      and (p.title ilike '%' || trim(p_query) || '%' or p.description ilike '%' || trim(p_query) || '%')
    union
    select n.project_id
    from public.nodes n
    where n.owner_id = auth.uid() and n.name ilike '%' || trim(p_query) || '%'
    union
    select n.project_id
    from public.documents d
    join public.nodes n on n.id = d.node_id and n.owner_id = auth.uid()
    where d.owner_id = auth.uid()
      and to_tsvector('english', coalesce(d.plain_text, '')) @@ websearch_to_tsquery('english', trim(p_query))
  ) matches
  where char_length(trim(p_query)) between 1 and 100
  limit 200;
$$;

create or replace function public.get_project_workspace(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'project', to_jsonb(p),
    'nodes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.sort_order, n.created_at)
      from public.nodes n
      where n.project_id = p.id and n.owner_id = auth.uid()
    ), '[]'::jsonb)
  )
  from public.projects p
  where p.id = p_project_id and p.owner_id = auth.uid();
$$;

grant execute on function public.search_project_ids(text) to authenticated;
grant execute on function public.get_project_workspace(uuid) to authenticated;

