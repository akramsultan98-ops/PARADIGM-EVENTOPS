# Deployment (Ubuntu VPS)

## Prerequisites
Ubuntu 22.04/24.04, Docker + Compose plugin, a domain with TLS (reverse proxy: Caddy or Nginx), ≥ 2 vCPU / 4 GB RAM.

## Steps
```bash
git clone <repo> paradigm-eventops && cd paradigm-eventops
cp .env.example .env
#  set: AUTH_SECRET (openssl rand -base64 48), POSTGRES_PASSWORD, APP_URL=https://eventops.<domain>,
#       ENABLE_DEMO_LOGIN=false, ANTHROPIC_API_KEY (optional), N8N_WEBHOOK_URL (optional)
docker compose up -d --build                 # migrations run automatically (prisma migrate deploy)
docker compose --profile optimizer up -d     # optional OR-Tools service; set OPTIMIZER_URL=http://optimizer:8090
curl -fsS http://localhost:3000/api/health   # {"status":"ok","database":"ok",...}
```
Create the first Super Admin: run the seed **only in a non-production staging copy**, or insert an admin user with a bcrypt hash and the `SUPER_ADMIN` role; then create real users from **Users & Roles** (temporary passwords, change on first login).

### Reverse proxy (Caddy example)
```
eventops.example.com {
  reverse_proxy 127.0.0.1:3000
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

## Configuration
See `.env.example`. Key points: `AUTH_SECRET` mandatory; `STORAGE_DRIVER=local` with the `uploads` volume (S3 driver interface exists but is not implemented — do not set `s3`); `MAX_UPLOAD_MB`; `ENABLE_DEMO_LOGIN=false` in production.

## Operations
- **Health:** `GET /api/health` (Docker HEALTHCHECK included).
- **Logs:** `docker compose logs -f app` (server errors are logged without leaking details to users).
- **Backups:** `scripts/backup.sh /var/backups/eventops` (pg_dump custom format + uploads tarball, 30-day retention). Schedule via cron, e.g. `15 2 * * * cd /opt/paradigm-eventops && DATABASE_URL=... scripts/backup.sh /var/backups/eventops`. Restore with `pg_restore --clean -d $DATABASE_URL file.dump`.
- **Migrations:** applied on container start with `prisma migrate deploy` (non-destructive). Never run `migrate reset` on production.
- **Scaling:** single instance by default; for multiple instances move rate limiting to a shared store and uploads to object storage.
