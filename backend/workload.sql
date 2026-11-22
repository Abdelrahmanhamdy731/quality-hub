
-- Activity measures inspections dated within the selected 30-day window.
-- Source statuses are preserved; this is not a reconstruction of past status.
create function public.inspection_workload(p_project uuid default null, end_date date default current_date)
returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
 select coalesce(nullif(owner,''),'Unassigned') as inspector,
 count(*)::integer as inspections,
 count(*) filter(where state='open')::integer as open,
 count(distinct occurred_on)::integer as active_days,
 round(count(*)::numeric/nullif(count(distinct occurred_on),0),1) as per_active_day,
 jsonb_agg(jsonb_build_object('date',occurred_on,'project',project_id)) as events
 from public.records
 where category='site_rfi' and is_current and occurred_on between end_date-29 and end_date
 and (p_project is null or project_id=p_project)
 group by coalesce(nullif(owner,''),'Unassigned')
 order by count(*) desc limit 40
 ) x
$$;
revoke all on function public.inspection_workload(uuid,date) from public,anon;
grant execute on function public.inspection_workload(uuid,date) to authenticated;
grant all on public.profiles, public.projects, public.project_memberships,public.records,public.project_updates,public.audit_log to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;
