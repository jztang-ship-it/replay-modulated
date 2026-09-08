-- READ ONLY. Run after the guarded 020 rollout; no business records or write RPCs.
WITH checks AS (
 SELECT 'migration_020_recorded' AS check_name,
   EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='020' AND name='catalog_read_only') AS passed
 UNION ALL
 SELECT 'rls_' || t, COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.' || t)),false)
 FROM unnest(ARRAY['players','game_logs']) t
 UNION ALL
 SELECT 'read_' || r || '_' || t, COALESCE(has_table_privilege(r,to_regclass('public.' || t),'SELECT'),false)
 FROM unnest(ARRAY['anon','authenticated']) r CROSS JOIN unnest(ARRAY['players','game_logs']) t
 UNION ALL
 SELECT 'no_table_write_' || r || '_' || t,
   NOT COALESCE(has_table_privilege(r,to_regclass('public.' || t),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),true)
 FROM unnest(ARRAY['anon','authenticated']) r CROSS JOIN unnest(ARRAY['players','game_logs']) t
 UNION ALL
 SELECT 'no_column_write_' || r || '_' || t,
   NOT COALESCE(has_any_column_privilege(r,to_regclass('public.' || t),'INSERT,UPDATE,REFERENCES'),true)
 FROM unnest(ARRAY['anon','authenticated']) r CROSS JOIN unnest(ARRAY['players','game_logs']) t
 UNION ALL
 SELECT 'backend_' || t || '_' || p, COALESCE(has_table_privilege('service_role',to_regclass('public.' || t),p),false)
 FROM unnest(ARRAY['players','game_logs']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
 UNION ALL
 SELECT 'rpc_invoker_safe_search_path', COALESCE((SELECT NOT prosecdef AND proconfig @> ARRAY['search_path=""']
 FROM pg_proc WHERE oid=to_regprocedure('public.get_random_log(text)')),false)
 UNION ALL
 SELECT 'rpc_execute_' || r, COALESCE(has_function_privilege(r,to_regprocedure('public.get_random_log(text)'),'EXECUTE'),false)
 FROM unnest(ARRAY['anon','authenticated','service_role']) r
 UNION ALL
 SELECT 'rpc_no_public_execute', NOT EXISTS(SELECT 1 FROM pg_proc p,
 LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid=to_regprocedure('public.get_random_log(text)') AND a.grantee=0 AND a.privilege_type='EXECUTE')
)
SELECT check_name,passed FROM checks
UNION ALL SELECT 'ALL_CHECKS_PASSED',bool_and(passed) FROM checks
ORDER BY check_name;
