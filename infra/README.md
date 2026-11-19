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
cp .env.example .env        # completar DOMINIO y secretos (openssl rand -hex 32; no usar base64)
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

### Cargar la carta de demostración

```bash
docker compose -f compose.prod.yml exec api node dist/admin/cli.js cargar-demo --slug nombre-local
# Carta real de Gula (precios provisorios, se ajustan desde la PC):
docker compose -f compose.prod.yml exec api node dist/admin/cli.js cargar-demo --slug gula --carta gula
```

La carta queda en `https://$DOMINIO/nombre-local`.

### Marca del local (color y logo de la carta)

```bash
docker compose -f compose.prod.yml exec api node dist/admin/cli.js marca --slug nombre-local \
  --color '#1f6f43' --logo https://ejemplo.com/logo.png
# Gula (carta en blanco y negro):
docker compose -f compose.prod.yml exec api node dist/admin/cli.js marca --slug gula --color '#111111'
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

## App de escritorio (PC del local)

```bash
pnpm --filter @gula/desktop dev                      # contra http://localhost:3000
GULA_SERVIDOR=https://$DOMINIO/api pnpm --filter @gula/desktop dev
```

La URL del servidor también se puede cambiar en la pantalla de ingreso ("Opciones avanzadas").

### Instalador y actualizaciones automáticas

```bash
# 1. subir "version" en apps/desktop/package.json
# 2. compilar y publicar (sube instalador + latest.yml a infra/actualizaciones/ del VPS)
DOMINIO=gula.com.ar VPS=usuario@ip infra/scripts/publicar-desktop.sh
```

- El instalador queda en `https://$DOMINIO/actualizaciones/GulaWeb-Setup-<versión>.exe`: se baja en la PC del local y se instala (no pide permisos de administrador).
- La app instalada apunta sola a `https://$DOMINIO/api`, busca versiones nuevas al abrir y cada 4 h, las baja en segundo plano y las instala **al cerrarse** (o con "Reiniciar ahora" en la barra). Nunca reinicia en medio del servicio.
- Los datos locales (SQLite, cola de impresión) viven en `%APPDATA%/GulaWeb` y sobreviven a actualizaciones y desinstalaciones.
- Sin certificado de firma, Windows SmartScreen muestra "Editor desconocido" la primera vez (Más información → Ejecutar de todas formas). Para firmar: `CSC_LINK`/`CSC_KEY_PASSWORD` de electron-builder.

Humo de punta a punta (API real + app compilada, requiere el Postgres de desarrollo):

```bash
pnpm --filter @gula/desktop e2e
```
