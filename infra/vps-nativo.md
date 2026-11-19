# GulaWeb en el VPS compartido (vaztech.com.ar)

El VPS (187.53.106.37) ya corre Caddy, Node 24 y PostgreSQL 18 nativos para otros proyectos, así que
GulaWeb va sin Docker (`compose.prod.yml` queda para un VPS dedicado).

| Pieza | Dónde |
|---|---|
| Código (clon de GitHub, `main`) | `/srv/gulaweb/repo` (usuario `gulaweb`) |
| API | `gulaweb-api.service` → `127.0.0.1:3010`; corre las migraciones al arrancar |
| Secretos | `/etc/gulaweb/api.env` (solo root) |
| Base | `gula` en el Postgres local; roles `gula_admin` (BYPASSRLS) y `gula_app` (con RLS) |
| Carta publicada | `/srv/gulaweb/carta` (copia del build) |
| Fotos | `/srv/gulaweb/fotos` |
| Instalador y auto-update | `/srv/gulaweb/actualizaciones` → `https://vaztech.com.ar/actualizaciones/` |
| Caddy | `/etc/caddy/sitios/gulaweb.caddy`, log en `/var/log/caddy/gulaweb.log` |
| Backup | `gulaweb-backup.timer`, 04:30, 14 días en `/srv/gulaweb/respaldos` |

Gestión Dalmata usaba este dominio: su bloque quedó en `/root/gestiond.caddy.desactivado`.

## Administración

```bash
ssh root@187.53.106.37
gula-admin crear-local --nombre "Gula" --slug gula --dueno "<nombre>" --email <email> --password '<clave>' --pin <pin>
gula-admin cargar-demo --slug gula --carta gula
gula-admin marca --slug gula --tema comanda-bn --lema 'est. 2024' --logo /marcas/gula-hoja.svg
```

## Actualizar

```bash
ssh root@187.53.106.37 'set -e; cd /srv/gulaweb/repo && sudo -u gulaweb git pull -q \
  && sudo -u gulaweb -H corepack pnpm install --frozen-lockfile --filter @gula/api... --filter @gula/carta... \
  && sudo -u gulaweb -H corepack pnpm --filter @gula/api... build \
  && sudo -u gulaweb -H corepack pnpm --filter @gula/carta exec vite build \
  && rsync -a --delete apps/carta/dist/ /srv/gulaweb/carta/ && systemctl restart gulaweb-api'
```

## App de PC apuntando acá

```bash
GULA_SERVIDOR_DEFECTO=https://vaztech.com.ar/api GULA_ACTUALIZACIONES=https://vaztech.com.ar/actualizaciones \
  pnpm --filter @gula/desktop dist        # Windows (en Linux: dist:linux)
```
O en la pantalla de ingreso de la app, campo servidor = `https://vaztech.com.ar/api`.
