BEGIN;
-- Legacy catalog tables were imported outside migrations 001-019. They are
-- optional on fresh installs; never create empty replacements for production data.
-- Keep public reads for basketball export scripts; only the backend may ingest.
DO $catalog$
DECLARE
  t text; col record; browser text; privilege text;
BEGIN
  IF to_regclass('public.players') IS NULL AND to_regclass('public.game_logs') IS NULL
     AND to_regprocedure('public.get_random_log(text)') IS NULL THEN
    RAISE NOTICE 'Optional legacy catalog absent; no catalog objects created';
    RETURN;
  END IF;
  IF to_regclass('public.players') IS NULL OR to_regclass('public.game_logs') IS NULL THEN
    RAISE EXCEPTION 'Partial legacy catalog: inspect schema before applying 020';
  END IF;
  FOREACH t IN ARRAY ARRAY['game_logs','players'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class
                   WHERE oid=to_regclass('public.' || t) AND relkind='r') THEN
      RAISE EXCEPTION 'Expected ordinary catalog table: %', t;
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    -- Table REVOKE does not remove independently granted column privileges.
    FOR col IN SELECT attname FROM pg_catalog.pg_attribute
      WHERE attrelid=to_regclass('public.' || t) AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated', col.attname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS catalog_public_read_020 ON public.%I', t);
    EXECUTE format('CREATE POLICY catalog_public_read_020 ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS catalog_service_write_020 ON public.%I', t);
    EXECUTE format('CREATE POLICY catalog_service_write_020 ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    -- Fail closed on inherited grants/owner/BYPASSRLS configuration. RLS alone
    -- does not protect TRUNCATE; ALL above also removes PG17 MAINTAIN privileges.
    FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=browser AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Unsafe browser role configuration: %', browser;
      END IF;
      FOREACH privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(browser, 'public.' || t, privilege) THEN
          RAISE EXCEPTION 'Inherited browser privilege remains: %.% %', browser, t, privilege;
        END IF;
      END LOOP;
      IF current_setting('server_version_num')::integer >= 170000 THEN
        IF has_table_privilege(browser, 'public.' || t, 'MAINTAIN') THEN
          RAISE EXCEPTION 'Inherited MAINTAIN privilege remains: %.%', browser, t;
        END IF;
      END IF;
      FOREACH privilege IN ARRAY ARRAY['INSERT','UPDATE','REFERENCES'] LOOP
        IF has_any_column_privilege(browser, 'public.' || t, privilege) THEN
          RAISE EXCEPTION 'Inherited browser column privilege remains: %.% %', browser, t, privilege;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF to_regprocedure('public.get_random_log(text)') IS NOT NULL THEN
    -- Preserve the existing API and invoker semantics; do not elevate reads.
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION public.get_random_log(target_player_id text)
      RETURNS json LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $body$
      DECLARE result json;
      BEGIN
        SELECT pg_catalog.row_to_json(g) INTO result
        FROM public.game_logs AS g
        WHERE g.player_id = target_player_id
        ORDER BY pg_catalog.random() LIMIT 1;
        RETURN result;
      END;
      $body$
    $ddl$;
    REVOKE ALL ON FUNCTION public.get_random_log(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_random_log(text) TO anon, authenticated, service_role;
  END IF;
END;
$catalog$;
COMMIT;
