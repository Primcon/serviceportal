# Deployment Readiness

## Required Production Configuration

Production runs with `AUTH_MODE=entra`. Application startup validates the customer and employee Entra applications, session secret, public origin, Azure private storage, Azure Communication Services Email, and notification worker secret before serving traffic.

Keep every secret in Azure Key Vault or an equivalent deployment secret store. Do not copy local `.env` values into source control, deployment definitions, or scheduler definitions.

## Deployment Sequence

1. Apply Prisma migrations with `npx prisma migrate deploy` against Azure Database for PostgreSQL.
2. Deploy the application with private Blob Storage, Entra, ACS Email, and Key Vault references configured.
3. Verify employee and customer sign-in, private attachment delivery, and a queued notification in staging.
4. Configure the Azure scheduled job only after the application deployment succeeds. Its dispatch contract is documented in [Customer notification delivery](notifications.md).
5. Verify backups, restore access, application health, and rollback before production traffic.

## Container Image

The included multi-stage [Dockerfile](../Dockerfile) creates a non-root Node 22 runtime image using Next.js standalone output. Build and validate it locally with:

```powershell
docker build -t vactech-service-portal:local .
docker run --rm -p 3000:3000 vactech-service-portal:local
```

Do not pass `.env` into the image build. Configure the deployed container with Key Vault-backed environment values. Azure Container Apps should target port `3000` and use the health probes below.

## Health Probes

Configure the hosting platform to use these unauthenticated endpoints:

- Liveness: `GET /api/health/live` confirms the application process can serve requests.
- Readiness: `GET /api/health/ready` confirms PostgreSQL connectivity. It returns `503` when the database is unavailable so the platform can remove the instance from traffic.

Both endpoints return only a generic status and set `Cache-Control: no-store`.

## Security Headers

Every page gets a Content Security Policy from [`src/proxy.ts`](../src/proxy.ts) with a fresh nonce per request, so only the portal's own scripts run. Pages render per request for this reason. All responses also send `nosniff`, a strict referrer policy, `X-Frame-Options: DENY`, a permissions policy, and HSTS in production ([`next.config.ts`](../next.config.ts)). Private files download unless they're raster images, and are served with a sandboxing policy.

Customer sign-out also ends the Entra External ID session. Register `https://<application-origin>/` as a redirect URI on the customer app registration so Entra returns customers to the portal afterwards. Employee sign-out is local only, so staff aren't signed out of their other Microsoft apps.

## Local Secrets

Local development doesn't need any production secret: the default `AUTH_MODE="development"` uses development identities, and files go to private local storage.

- Never copy production values into a local `.env`. If you need to test Entra, ACS or Blob Storage locally, create separate development app registrations, a development ACS resource and a development storage account, each with their own keys.
- Keep the project out of OneDrive and other synced folders, which copy `.env` to the cloud.
- If production secrets were ever stored in a local or synced `.env`, rotate them: Entra client secrets for both app registrations, the ACS access keys, the storage account keys, `AUTH_SESSION_SECRET`, and both worker secrets.

## Continuous Integration

[`.github/workflows/quality.yml`](../.github/workflows/quality.yml) validates Prisma, applies migrations to disposable PostgreSQL, type-checks, runs lint and tests (including database tests), and creates a production build and container image on pull requests and pushes to `main`.