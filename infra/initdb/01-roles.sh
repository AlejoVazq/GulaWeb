#!/bin/bash
# Crea el rol de la aplicación (sujeto a RLS) y las bases indicadas en GULA_DBS (o POSTGRES_DB).
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE gula_app LOGIN PASSWORD '${GULA_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
SQL
for db in ${GULA_DBS:-}; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -c "CREATE DATABASE $db;"
done
