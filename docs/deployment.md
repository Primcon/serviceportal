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

## Time Zone

The container runs in UTC. `APP_TIME_ZONE` (an IANA name, default `America/Phoenix`) sets the zone used for times on server-rendered pages and the printed traveler. Calendar dates such as promised and quoted dates are stored as midnight UTC and never shift.

## File Storage

Files are kept in one private Blob Storage container. The app's identity needs **Storage Blob Data Contributor** on it.

- **Photos** are stored three ways: a compressed viewing copy and a thumbnail (both WebP, Hot tier), and the untouched original in the **Archive** tier. Everyone, staff and customers, sees the viewing copy. The storage account must be general-purpose v2 with LRS, GRS or RA-GRS redundancy; zone-redundant accounts don't support the Archive tier.
- **An archived original can't be read directly.** When staff request one, the app copies it to `retrievals/<attachment id>/original` in the Hot tier. Azure completes that copy in up to 15 hours. The archived original itself never moves.
- **Retrieved copies are removed after 7 days** by a lifecycle rule, kept in [`deploy/storage-lifecycle-policy.json`](../deploy/storage-lifecycle-policy.json). Apply it to each storage account once:

  ```bash
  az storage account management-policy create --account-name <account> --resource-group <group> --policy @deploy/storage-lifecycle-policy.json
  ```

- Azure charges an early-deletion fee for an archived blob removed within 180 days. For a deleted photo this is a fraction of a cent.
- Documents and model manuals are stored as uploaded, in the Hot tier.
- Local development without `AZURE_STORAGE_ACCOUNT_NAME` set stores files under `.data/private-storage`, where there is no archive tier and a requested original is available at once.

## Upload Limits

Photos are uploaded one per request to `/api/internal/work-orders/<id>/photos` (40 MB each), which the proxy doesn't handle. Documents (25 MB) and model manuals (50 MB) go through server actions, which do pass through the proxy; `next.config.ts` raises both the server-action limit and `proxyClientMaxBodySize` to 64 MB, because the proxy otherwise cuts request bodies off at 10 MB.

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