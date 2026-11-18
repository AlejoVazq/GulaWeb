ALTER TABLE operaciones_aplicadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE operaciones_aplicadas FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_local ON operaciones_aplicadas
  USING (local_id = nullif(current_setting('app.local_id', true), '')::uuid)
  WITH CHECK (local_id = nullif(current_setting('app.local_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON operaciones_aplicadas TO gula_app;
