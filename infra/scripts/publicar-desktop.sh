#!/usr/bin/env bash
# Compila el instalador de Windows y lo sube al VPS para el auto-update.
# Uso: DOMINIO=gula.com.ar VPS=usuario@ip infra/scripts/publicar-desktop.sh
# Antes: subir "version" en apps/desktop/package.json (las PCs solo actualizan a una versión mayor).
set -euo pipefail
: "${DOMINIO:?definí DOMINIO}"
: "${VPS:?definí VPS (usuario@host)}"
DESTINO="${DESTINO:-/opt/gula/infra/actualizaciones}"
cd "$(dirname "$0")/../../apps/desktop"
GULA_SERVIDOR_DEFECTO="https://$DOMINIO/api" GULA_ACTUALIZACIONES="https://$DOMINIO/actualizaciones" pnpm dist
VERSION=$(node -p "require('./package.json').version")
# Primero el instalador y su blockmap; latest.yml al final, para que ninguna PC vea una versión a medio subir.
scp "release/GulaWeb-Setup-$VERSION.exe" "release/GulaWeb-Setup-$VERSION.exe.blockmap" "$VPS:$DESTINO/"
scp release/latest.yml "$VPS:$DESTINO/"
echo "Publicada la versión $VERSION en https://$DOMINIO/actualizaciones/"
