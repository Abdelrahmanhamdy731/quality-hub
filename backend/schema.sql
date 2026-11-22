-- Quality Hub. Run once in a dedicated Supabase project.
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
 full_name text not null default '', role text not null default 'viewer' check(role in ('admin','viewer')),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), code text not null unique check(length(code) between 1 and 50),
 name text not null check(length(name) between 1 and 400), number text not null default '', contract text not null default '',
 contractor text not null default '', stage text not null default 'Active', color text not null default '#7285cc',
 actual numeric check(actual between 0 and 100), planned numeric check(planned between 0 and 100),
 as_of date, note text not null default '', archived boolean not null default false,
 source_label text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.project_memberships (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(project_id,user_id)
);
create table public.records (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 category text not null check(category in ('site_rfi','vendor_rfi','findings','smr','docs','punch','test_pack','dossier','wps','welders','summary','actions','regsum','vdocs')),
 reference text not null check(length(reference) between 1 and 500), title text not null default '',
 status text not null default 'Open', state text not null default 'open' check(state in ('open','closed','review','void','superseded','other')),
 discipline text not null default '', owner text not null default '', due_date date, occurred_on date,
 revision text not null default '', is_current boolean not null default true,
 payload jsonb not null default '{}'::jsonb, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,category,reference,revision)
);
create index records_project_category on public.records(project_id,category,state);
create index records_due on public.records(due_date) where state in ('open','review') and is_current;
create table public.project_updates (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 as_of date not null, actual numeric check(actual between 0 and 100), planned numeric check(planned between 0 and 100),
 note text not null default '', author_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create table public.audit_log (
 id bigint generated always as identity primary key, actor_id uuid, action text not null,
 entity text not null, entity_id text, label text not null default '', created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active)
$$;
create function public.can_view_project(pid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and
 (p.role='admin' or exists(select 1 from public.project_memberships m where m.user_id=p.id and m.project_id=pid)))
$$;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_memberships enable row level security;
alter table public.records enable row level security;
alter table public.project_updates enable row level security;
alter table public.audit_log enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy projects_read on public.projects for select to authenticated using(public.can_view_project(id));
create policy projects_admin on public.projects for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy memberships_read on public.project_memberships for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy memberships_admin on public.project_memberships for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy records_read on public.records for select to authenticated using(public.can_view_project(project_id));
create policy records_admin on public.records for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy updates_read on public.project_updates for select to authenticated using(public.can_view_project(project_id));
create policy updates_admin on public.project_updates for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy audit_read on public.audit_log for select to authenticated using(public.is_admin());
grant usage on schema public to authenticated;
grant select on public.profiles, public.audit_log to authenticated;
grant select,insert,update,delete on public.projects,public.records,public.project_memberships,public.project_updates to authenticated;
revoke all on public.profiles,public.projects,public.records,public.project_memberships,public.project_updates,public.audit_log from anon;
create function public.track_change() returns trigger language plpgsql security definer set search_path=public as $$
 declare label_text text;
 begin
 if TG_OP='UPDATE' then NEW.updated_at=now(); if TG_TABLE_NAME='records' then NEW.version=OLD.version+1; end if; end if;
 if auth.uid() is not null then
 if TG_OP='DELETE' then label_text=coalesce(to_jsonb(OLD)->>'reference',to_jsonb(OLD)->>'code','');
 insert into public.audit_log(actor_id,action,entity,entity_id,label) values(auth.uid(),TG_OP,TG_TABLE_NAME,to_jsonb(OLD)->>'id',label_text);
 else label_text=coalesce(to_jsonb(NEW)->>'reference',to_jsonb(NEW)->>'code','');
 insert into public.audit_log(actor_id,action,entity,entity_id,label) values(auth.uid(),TG_OP,TG_TABLE_NAME,to_jsonb(NEW)->>'id',label_text); end if;
 end if;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end $$;
create trigger project_audit before insert or update or delete on public.projects for each row execute function public.track_change();
create trigger record_audit before insert or update or delete on public.records for each row execute function public.track_change();
create function public.dashboard_stats() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
 select project_id, category, count(*)::integer as total,
 count(*) filter(where state='open')::integer as open,
 count(*) filter(where state='review')::integer as review,
 count(*) filter(where state='closed')::integer as closed,
 count(*) filter(where state in ('open','review') and due_date<current_date)::integer as overdue
 from public.records where is_current group by project_id,category
 ) x
$$;
create function public.set_project_access(target_user uuid, allowed_projects uuid[]) returns void language plpgsql security definer set search_path=public as $$
 begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.profiles where id=target_user and role='viewer') then raise exception 'Viewer not found'; end if;
 delete from public.project_memberships where user_id=target_user;
 insert into public.project_memberships(user_id,project_id) select target_user,unnest(allowed_projects);
 insert into public.audit_log(actor_id,action,entity,entity_id,label) values(auth.uid(),'ACCESS_UPDATED','profiles',target_user::text,'Project access updated');
 end $$;
create function public.publish_progress(pid uuid, entry_date date, actual_pct numeric, planned_pct numeric, entry_note text) returns void language plpgsql security definer set search_path=public as $$
 begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if actual_pct<0 or actual_pct>100 or planned_pct<0 or planned_pct>100 then raise exception 'Progress must be 0 to 100'; end if;
 if entry_date is null then raise exception 'Reporting date required'; end if;
 insert into public.project_updates(project_id,as_of,actual,planned,note,author_id) values(pid,entry_date,actual_pct,planned_pct,entry_note,auth.uid());
 update public.projects set actual=actual_pct,planned=planned_pct,as_of=entry_date,note=entry_note where id=pid and (as_of is null or entry_date>=as_of);
 end $$;
revoke all on function public.is_admin(),public.can_view_project(uuid),public.dashboard_stats(),public.set_project_access(uuid,uuid[]),public.publish_progress(uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.is_admin(),public.can_view_project(uuid),public.dashboard_stats(),public.set_project_access(uuid,uuid[]),public.publish_progress(uuid,date,numeric,numeric,text) to authenticated;
