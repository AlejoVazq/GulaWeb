-- Aislamiento por local (spec §13). gula_app no tiene BYPASSRLS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios', 'dispositivos', 'refresh_tokens', 'auditoria'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY aislamiento_local ON %I
         USING (local_id = nullif(current_setting(''app.local_id'', true), '''')::uuid)
         WITH CHECK (local_id = nullif(current_setting(''app.local_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

ALTER TABLE locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE locales FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_local ON locales
  USING (id = nullif(current_setting('app.local_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.local_id', true), '')::uuid);

GRANT USAGE ON SCHEMA public TO gula_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gula_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gula_app;
