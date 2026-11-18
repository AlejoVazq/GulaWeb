-- Si el UPDATE fija actualizado_en a mano (importaciones, tests), se respeta.
CREATE OR REPLACE FUNCTION tocar_actualizado_en() RETURNS trigger AS $$
BEGIN
  IF NEW.actualizado_en IS NOT DISTINCT FROM OLD.actualizado_en THEN
    NEW.actualizado_en := clock_timestamp();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
