-- RLS y actualizado_en para la tabla de delivery.
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_local ON deliveries
  USING (local_id = nullif(current_setting('app.local_id', true), '')::uuid)
  WITH CHECK (local_id = nullif(current_setting('app.local_id', true), '')::uuid);
CREATE TRIGGER deliveries_actualizado_en BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
GRANT SELECT, INSERT, UPDATE, DELETE ON deliveries TO gula_app;
