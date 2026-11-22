-- Atomic bulk workbook import. Explicit active-admin and project-access checks
-- match the records policies once, avoiding per-row policy overhead on bulk saves.
create or replace function public.apply_assistant_workbook(pid uuid, imports jsonb)
returns jsonb language plpgsql security definer set search_path=public set statement_timeout='120s' as $$
declare packed jsonb; added integer:=0; changed integer:=0; expected_updates integer:=0;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if pid is null or not public.can_view_project(pid) then raise exception 'Project access denied'; end if;
 if imports is null or jsonb_typeof(imports)<>'array' or jsonb_array_length(imports)<1 or jsonb_array_length(imports)>30 then raise exception 'Use 1 to 30 register tables'; end if;
 if exists(select 1 from jsonb_array_elements(imports) p where jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 5000) then raise exception 'Use 1 to 5000 rows per table'; end if;
 select jsonb_agg(item || jsonb_build_object('category',part->>'cat')) into packed
 from jsonb_array_elements(imports) part cross join lateral jsonb_array_elements(part->'items') item;
 if jsonb_array_length(packed)>20000 then raise exception 'Use at most 20000 records per workbook'; end if;
 if exists(select 1 from jsonb_array_elements(packed) x where
   coalesce(x->>'category','') not in ('site_rfi','vendor_rfi','findings','smr','docs','punch','test_pack','dossier','wps','welders','summary','actions','regsum','vdocs')
   or length(coalesce(x->>'reference','')) not between 1 and 500
   or length(coalesce(x->>'title','')) not between 1 and 3000
   or jsonb_typeof(x->'payload') is distinct from 'object'
   or coalesce(x->>'state','') not in ('open','closed','review','void','superseded','other')
   or jsonb_typeof(x->'is_current') is distinct from 'boolean'
   or x->>'status' is null) then raise exception 'Invalid import record'; end if;
 if exists(select 1 from jsonb_array_elements(packed) x group by x->>'category',x->>'reference',coalesce(x->>'revision','') having count(*)>1) then raise exception 'Duplicate reference and revision'; end if;
 -- Lock existing identities in a stable order, then validate every version.
 perform r.id from public.records r join jsonb_to_recordset(packed) x(category text,reference text,revision text)
 on r.project_id=pid and r.category=x.category and r.reference=x.reference and r.revision=coalesce(x.revision,'') order by r.id for update of r;
 if exists(select 1 from jsonb_to_recordset(packed) x(category text,reference text,revision text,expected_version integer)
 left join public.records r on r.project_id=pid and r.category=x.category and r.reference=x.reference and r.revision=coalesce(x.revision,'')
 where (r.id is null and x.expected_version is not null) or (r.id is not null and (x.expected_version is null or x.expected_version<>r.version))) then raise exception 'Records changed since analysis. Upload the file again.'; end if;
 select count(*) into expected_updates from jsonb_to_recordset(packed) x(expected_version integer) where x.expected_version is not null;
 update public.records r set title=x.title,status=x.status,state=x.state,discipline=coalesce(x.discipline,''),owner=coalesce(x.owner,''),due_date=x.due_date,occurred_on=x.occurred_on,is_current=x.is_current,payload=x.payload
 from jsonb_to_recordset(packed) x(category text,reference text,revision text,title text,status text,state text,discipline text,owner text,due_date date,occurred_on date,is_current boolean,payload jsonb,expected_version integer)
 where r.project_id=pid and r.category=x.category and r.reference=x.reference and r.revision=coalesce(x.revision,'') and x.expected_version=r.version;
 get diagnostics changed=row_count;
 if changed<>expected_updates then raise exception 'Records changed since analysis. Upload the file again.'; end if;
 insert into public.records(project_id,category,reference,revision,title,status,state,discipline,owner,due_date,occurred_on,is_current,payload)
 select pid,x.category,x.reference,coalesce(x.revision,''),x.title,x.status,x.state,coalesce(x.discipline,''),coalesce(x.owner,''),x.due_date,x.occurred_on,x.is_current,x.payload
 from jsonb_to_recordset(packed) x(category text,reference text,revision text,title text,status text,state text,discipline text,owner text,due_date date,occurred_on date,is_current boolean,payload jsonb,expected_version integer)
 where x.expected_version is null;
 get diagnostics added=row_count;
 return jsonb_build_object('added',added,'updated',changed,'tables',jsonb_array_length(imports));
end $$;
revoke all on function public.apply_assistant_workbook(uuid,jsonb) from public,anon;
grant execute on function public.apply_assistant_workbook(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
