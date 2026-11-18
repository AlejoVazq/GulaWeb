-- RLS y actualizado_en para las tablas de la carta.
CREATE OR REPLACE FUNCTION tocar_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := clock_timestamp();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sectores', 'categorias', 'productos', 'grupos_opciones', 'opciones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY aislamiento_local ON %I
         USING (local_id = nullif(current_setting(''app.local_id'', true), '''')::uuid)
         WITH CHECK (local_id = nullif(current_setting(''app.local_id'', true), '''')::uuid)', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en()',
      t || '_actualizado_en', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gula_app;
