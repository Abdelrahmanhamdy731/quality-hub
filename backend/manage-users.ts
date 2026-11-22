import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const origins = new Set(['https://ccqm-mastery-hub.github.io','https://abdelrahmanhamdy731.github.io']);
Deno.serve(async (req) => {
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://abdelrahmanhamdy731.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
 const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const admin=createClient(url,service,{auth:{persistSession:false}});
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /i,'');
 const {data:{user},error:authError}=await admin.auth.getUser(token);
 if(authError||!user)return reply({error:'Sign in required'},401);
 const {data:profile}=await admin.from('profiles').select('role,active').eq('id',user.id).single();
 if(!profile?.active||profile.role!=='admin')return reply({error:'Admin access required'},403);
 const b=await req.json();
 if(b.action==='create'){
 const username=String(b.username||'').trim().toLowerCase(),name=String(b.full_name||'').trim();
 if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))return reply({error:'Username must be 3 to 40 characters: letters, numbers, dot, dash, underscore'},400);
 if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)return reply({error:'Use a password with 12 to 128 characters'},400);
 const {data,error}=await admin.auth.admin.createUser({email:username+'@quality-hub.internal',password:b.password,email_confirm:true});
 if(error)return reply({error:error.message},400);
 const {error:pe}=await admin.from('profiles').insert({id:data.user.id,username,full_name:name.slice(0,160),role:'viewer'});
 if(pe){await admin.auth.admin.deleteUser(data.user.id);return reply({error:'Could not create user profile'},400);}
 await admin.from('audit_log').insert({actor_id:user.id,action:'USER_CREATED',entity:'profiles',entity_id:data.user.id,label:username});
 return reply({id:data.user.id,username});
 }
 if(b.action==='password'){
 if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)return reply({error:'Use a password with 12 to 128 characters'},400);
 const {data:target}=await admin.from('profiles').select('id,username').eq('id',b.user_id).single();
 if(!target)return reply({error:'User not found'},404);
 const {error}=await admin.auth.admin.updateUserById(target.id,{password:b.password});
 if(error)return reply({error:error.message},400);
 await admin.from('audit_log').insert({actor_id:user.id,action:'PASSWORD_CHANGED',entity:'profiles',entity_id:target.id,label:target.username});
 return reply({ok:true});
 }
 if(b.action==='active'){
 if(b.user_id===user.id)return reply({error:'You cannot disable your own account'},400);
 const {data:target}=await admin.from('profiles').select('id,role,username').eq('id',b.user_id).single();
 if(!target||target.role==='admin')return reply({error:'Only viewer accounts can be disabled here'},400);
 const active=b.active===true;
 const {error}=await admin.from('profiles').update({active}).eq('id',target.id);
 if(error)return reply({error:error.message},400);
 await admin.auth.admin.updateUserById(target.id,{ban_duration:active?'none':'876000h'});
 await admin.from('audit_log').insert({actor_id:user.id,action:active?'USER_ENABLED':'USER_DISABLED',entity:'profiles',entity_id:target.id,label:target.username});
 return reply({ok:true});
 }
 return reply({error:'Unknown action'},400);
 }catch{return reply({error:'Request failed. Check the fields and try again.'},400);}
});
