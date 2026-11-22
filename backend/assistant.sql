-- Project assistant import. Atomic, permission-enforced, optimistic concurrency.
create or replace function public.apply_assistant_import(pid uuid, cat text, items jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare x jsonb; existing public.records%rowtype; added integer:=0; changed integer:=0;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if not public.can_view_project(pid) then raise exception 'Project access denied'; end if;
 if pid is null or cat is null then raise exception 'Project and register required'; end if;
 if items is null or jsonb_typeof(items) is distinct from 'array' then raise exception 'Rows must be an array'; end if;
 if jsonb_array_length(items) < 1 or jsonb_array_length(items)>5000 then raise exception 'Use 1 to 5000 rows'; end if;
 if cat not in ('site_rfi','vendor_rfi','findings','smr','docs','punch','test_pack','dossier','wps','welders','summary','actions','regsum','vdocs') then raise exception 'Invalid register'; end if;
 if exists(select 1 from jsonb_array_elements(items) a group by a->>'reference',coalesce(a->>'revision','') having count(*)>1) then raise exception 'Duplicate reference and revision'; end if;
 for x in select value from jsonb_array_elements(items) order by value->>'reference',coalesce(value->>'revision','') loop
  if jsonb_typeof(x->'payload') is distinct from 'object' then raise exception 'Additional fields must be an object'; end if;
  if length(coalesce(x->>'reference','')) not between 1 and 500 or length(coalesce(x->>'title','')) not between 1 and 3000 then raise exception 'Reference and title required'; end if;
  select * into existing from public.records where project_id=pid and category=cat and reference=x->>'reference' and revision=coalesce(x->>'revision','') for update;
  if found then
   if (x->>'expected_version') is null or existing.version<>(x->>'expected_version')::integer then raise exception 'Records changed since preview. Analyze the file again.'; end if;
   update public.records set title=x->>'title',status=x->>'status',state=x->>'state',discipline=x->>'discipline',owner=x->>'owner',due_date=nullif(x->>'due_date','')::date,occurred_on=nullif(x->>'occurred_on','')::date,is_current=(x->>'is_current')::boolean,payload=coalesce(x->'payload','{}'::jsonb) where id=existing.id;
   changed:=changed+1;
  else
   if (x->>'expected_version') is not null then raise exception 'Records changed since preview. Analyze the file again.'; end if;
   insert into public.records(project_id,category,reference,revision,title,status,state,discipline,owner,due_date,occurred_on,is_current,payload)
   values(pid,cat,x->>'reference',coalesce(x->>'revision',''),x->>'title',x->>'status',x->>'state',coalesce(x->>'discipline',''),coalesce(x->>'owner',''),nullif(x->>'due_date','')::date,nullif(x->>'occurred_on','')::date,(x->>'is_current')::boolean,coalesce(x->'payload','{}'::jsonb));
   added:=added+1;
  end if;
 end loop;
 return jsonb_build_object('added',added,'updated',changed);
end $$;
revoke all on function public.apply_assistant_import(uuid,text,jsonb) from public,anon;
grant execute on function public.apply_assistant_import(uuid,text,jsonb) to authenticated;
