# Infraestructura GulaWeb

## Desarrollo

```bash
docker compose -f infra/compose.dev.yml up -d      # Postgres en localhost:5433 (gula_dev y gula_test)
pnpm install
pnpm test
```

## Producción (VPS)

Requisitos: Docker + plugin compose, puertos 80/443 abiertos, DNS del dominio apuntando al VPS.

```bash
git clone <repo> gula && cd gula/infra
cp .env.example .env        # completar DOMINIO y secretos (openssl rand -base64 32)
docker compose -f compose.prod.yml up -d --build
curl https://$DOMINIO/api/salud      # → {"ok":true}
```

Caddy obtiene el certificado HTTPS solo. Las migraciones corren al iniciar la API.

### Alta de un local

```bash
docker compose -f compose.prod.yml exec api node dist/admin/cli.js crear-local \
  --nombre "Nombre del local" --slug nombre-local --dueno "Nombre dueño" \
  --email dueno@mail.com --password '<contraseña>' --pin 1234
```

### Actualizar

```bash
git pull && docker compose -f compose.prod.yml up -d --build
```

## Backups

`infra/backup/backup.sh` hace `pg_dump`, lo cifra con GPG (`BACKUP_PASSPHRASE`), guarda en
`/var/backups/gula` (14 días) y, si `BACKUP_RCLONE_REMOTE` está definido, lo copia afuera del VPS.

Cron diario a las 4:00 (`crontab -e`):

```
0 4 * * * /ruta/gula/infra/backup/backup.sh >> /var/log/gula-backup.log 2>&1
```

### Restaurar

```bash
gpg --batch --passphrase "$BACKUP_PASSPHRASE" -d gula-AAAAMMDD-HHMM.dump.gpg \
  | docker compose -f compose.prod.yml exec -T postgres pg_restore -U postgres -d gula --clean --if-exists
```
