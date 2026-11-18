#!/usr/bin/env bash
# Backup cifrado de Postgres. Uso: infra/backup/backup.sh  (lee infra/.env)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source ./.env; set +a
: "${BACKUP_PASSPHRASE:?falta BACKUP_PASSPHRASE}"

DESTINO="${BACKUP_DIR:-/var/backups/gula}"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/gula-$(date +%Y%m%d-%H%M).dump.gpg"

docker compose -f compose.prod.yml exec -T postgres pg_dump -U postgres -Fc gula \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$ARCHIVO"

find "$DESTINO" -name 'gula-*.dump.gpg' -mtime +14 -delete

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  rclone copy "$ARCHIVO" "$BACKUP_RCLONE_REMOTE"
fi
echo "Backup listo: $ARCHIVO"
