# MVP Roadmap

## Stage 0: Foundation

Next.js, Docker PostgreSQL, Prisma proposal, documentation, and architectural guardrails. No business workflows, migrations, or Azure integration.

## Stage 1: First Vertical Slice

Company -> Equipment -> Work Order -> Customer-visible Update -> Customer Work Order View. Use development identity and notification adapters. Prove server-side cross-company and internal-only authorization. Add customer-visible photo upload/gallery only after the core path works.

## Stage 2: Internal Service Workspace

Work-order list/search, technician detail workspace, stage/condition changes, status history, internal notes/findings, documents, uploads, and activity.

## Stage 3: Customer Portal

Customer repair dashboard/filtering/search, equipment history, documents, timeline, account, and notification preferences.

## Stage 4: Administration and Hardening

Companies, locations, users, access-request review, minimal role/workflow management, audit review, accessibility, error handling, and photo performance work.

## Stage 5: Production Integration

Replace development adapters with Entra identity, Azure Blob Storage, Azure PostgreSQL, approved email delivery, CI/CD, secure environments, monitoring, backups, and deployment runbooks.

Each stage requires focused behavior checks, authorization coverage, linting, build, and TypeScript validation.
