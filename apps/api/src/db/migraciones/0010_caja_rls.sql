-- RLS y actualizado_en para las tablas de caja.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['turnos_caja', 'cobros', 'pagos', 'movimientos_caja'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY aislamiento_local ON %I
         USING (local_id = nullif(current_setting(''app.local_id'', true), '''')::uuid)
         WITH CHECK (local_id = nullif(current_setting(''app.local_id'', true), '''')::uuid)', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en()',
      t || '_actualizado_en', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO gula_app', t);
  END LOOP;
END $$;
