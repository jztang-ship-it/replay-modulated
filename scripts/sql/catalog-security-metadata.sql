-- Metadata only: no catalog/business rows, Auth records, passwords or API keys.
SELECT jsonb_build_object(
 'database',current_database(),
 'tables',(SELECT jsonb_agg(jsonb_build_object(
   'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
   'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl,
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
     'not_null',a.attnotnull,'acl',a.attacl,'identity',a.attidentity,'generated',a.attgenerated,
     'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true)) ORDER BY conname)
     FROM pg_constraint WHERE conrelid=c.oid),
   'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indrelid=c.oid),
   'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,
     'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r) FROM unnest(p.polroles) r),
     'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
     FROM pg_policy p WHERE p.polrelid=c.oid),
   'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid,true) ORDER BY tgname) FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal)
 ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('players','game_logs')),
 'rpc',(SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),
   'acl',p.proacl,'config',p.proconfig,'security_definer',p.prosecdef)
   FROM pg_proc p WHERE p.oid=to_regprocedure('public.get_random_log(text)')),
 'history',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'statements_md5',md5(statements::text)) ORDER BY version)
   FROM supabase_migrations.schema_migrations),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls,'inherit',rolinherit) ORDER BY rolname)
   FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),
   'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY roleid,member) FROM pg_auth_members),
 'defaults',(SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'type',defaclobjtype,'acl',defaclacl)
   ORDER BY defaclrole,defaclobjtype) FROM pg_default_acl WHERE defaclnamespace='public'::regnamespace)
) AS payload
