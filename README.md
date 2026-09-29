# VacTech Service Portal

VacTech Service Portal is a standalone digital service record for customer equipment. VacTech employees document work orders and repairs; authorized customers securely follow their equipment's service progress, updates, photos, documents, and history.

The current milestone delivers the core service workflow: Company -> Location -> Equipment -> Work Order -> Customer-visible Update -> Customer Work Order View, with internal service operations, customer portal views, access administration, private attachments, and audit history.

## Technology

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL with Prisma
- Docker Compose for local PostgreSQL
- Development adapters that later transition to Microsoft Entra and Azure services

## Local Setup

Prerequisites: Node.js 20.9 or later, npm, Docker Desktop, and Azure CLI when using Azure Blob Storage locally.

```bash
npm install
Copy-Item .env.example .env
docker compose up -d database
npx prisma validate
npm run dev
```

The application is available at `http://localhost:3000`.

For local authorization testing, set `DEVELOPMENT_INTERNAL_ROLE` in `.env` to `VACTECH_MANAGER`, `VACTECH_SERVICE_USER`, or `PORTAL_ADMINISTRATOR`. The default is `VACTECH_MANAGER`; service users can document work but cannot use administration actions.

Set `AUTH_MODE="entra"` to require verified Entra sessions locally. In the default `development` mode, the portal uses development identities when no matching Entra session is present.

### Production identity plan

Production uses two separate Microsoft Entra applications: one customer-facing application using Entra External ID and one employee-facing application using Microsoft Entra ID. Configure the `ENTRA_CUSTOMER_*` and `ENTRA_EMPLOYEE_*` variables from `.env.example` only when wiring production authentication. Local development continues to use the development identity adapter.

The planned callback endpoints are `/api/auth/customer/callback` and `/api/auth/employee/callback`; login starts at `/api/auth/customer/login` or `/api/auth/employee/login`. Set `AUTH_SESSION_SECRET` to a unique random value of at least 32 characters in production.

### Private File Storage

Without Azure storage credentials, uploads are written to private local storage in `.data/private-storage`. This directory is ignored by Git and files are delivered only through the authorized application routes.

To use Azure Blob Storage, create a private container and add `AZURE_STORAGE_CONTAINER_NAME` plus either `AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_ACCOUNT_NAME` to `.env`. With the account-name option, authenticate through `az login` locally or a managed identity in Azure and grant that identity `Storage Blob Data Contributor` on the storage account.

After installing Azure CLI on Windows, restart VS Code so its terminals reload PATH. The installed CLI can be verified with:

```powershell
az version
az account show
az storage container exists --account-name vactechservicefiles --name service-attachments --auth-mode login
```

If the current terminal still cannot resolve `az`, use the installed binary directly at `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` or open a new VS Code window.

### Customer Email Delivery

Production customer notifications use Azure Communication Services Email. Configure the ACS connection string, verified sender address, application origin, and worker secret described in [.env.example](.env.example), then schedule authenticated dispatch calls as described in [Customer notification delivery](docs/notifications.md). Without ACS configuration, notifications remain visible as locally recorded events and are not sent externally.

## Validation

```bash
npm run lint
npm run build
npx prisma validate
docker compose config
```

The repository includes Prisma migrations for the core data model and access-grant integrity. Apply them locally with `npx prisma migrate deploy` after starting the database service.

## Documentation

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Workflow](docs/workflow.md)
- [Permissions](docs/permissions.md)
- [MVP roadmap](docs/mvp-roadmap.md)
- [Customer notification delivery](docs/notifications.md)
- [Deployment readiness](docs/deployment.md)
