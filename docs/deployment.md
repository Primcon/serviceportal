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

## Continuous Integration

[`.github/workflows/quality.yml`](../.github/workflows/quality.yml) validates Prisma, applies migrations to disposable PostgreSQL, runs lint and tests, and creates a production build on pull requests and pushes to `main`.