-- Keep every worksheet in one transaction. The existing function enforces
-- admin/project access, row validation and optimistic versions for each table.
create or replace function public.apply_assistant_workbook(pid uuid, imports jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare part jsonb; result jsonb; added integer:=0; updated integer:=0; count_rows integer:=0;
begin
 if jsonb_typeof(imports) <> 'array' or jsonb_array_length(imports)<1 or jsonb_array_length(imports)>30 then raise exception 'Use 1 to 30 register tables'; end if;
 for part in select value from jsonb_array_elements(imports) loop
   count_rows:=count_rows+jsonb_array_length(part->'items');
 end loop;
 if count_rows>20000 then raise exception 'Use at most 20000 records per workbook'; end if;
 for part in select value from jsonb_array_elements(imports) loop
   result:=public.apply_assistant_import(pid,part->>'cat',part->'items');
   added:=added+coalesce((result->>'added')::integer,0);
   updated:=updated+coalesce((result->>'updated')::integer,0);
 end loop;
 return jsonb_build_object('added',added,'updated',updated,'tables',jsonb_array_length(imports));
end $$;
revoke all on function public.apply_assistant_workbook(uuid,jsonb) from public,anon;
grant execute on function public.apply_assistant_workbook(uuid,jsonb) to authenticated;
