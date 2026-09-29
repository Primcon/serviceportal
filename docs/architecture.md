# Architecture

## Application

The portal is a TypeScript Next.js App Router modular monolith. React provides responsive internal and customer experiences. Server Actions and route handlers own validated reads and mutations. Browser parameters and hidden UI are never authorization controls.

Feature modules own companies, equipment, work orders, attachments, and access behavior. Shared UI belongs in `src/components`; generic helpers and Prisma configuration belong in `src/lib`; provider boundaries belong in `src/services` only when used.

## Data and Security

PostgreSQL is the system of record and Prisma is the ORM. Each customer query starts with an authenticated active user and an authorized `UserAccess` company grant, then returns only customer-visible related records. Important actions create audit events.

## Adapters

Development uses a role-switching identity adapter, private local storage, and logged notifications. Production replacements are Microsoft Entra External ID/customer identity, appropriate Entra identity for employees, Azure Blob Storage, Azure Database for PostgreSQL, and an approved email provider. Core domain code receives an actor and private storage identifiers, not provider-specific credentials or public URLs.

Customer and employee authentication use separate Entra applications. Their tenant, client, authority, and callback configuration are kept separate at the application boundary before claims are mapped to the shared actor contract.

Private files are served only after current-user authorization through a short-lived grant or an application proxy.

## Project Structure

- `src/app`: routes, layouts, and route handlers
- `src/features`: domain-owned UI, validation, policies, and server behavior
- `src/components`: shared accessible UI
- `src/lib`: Prisma singleton, environment parsing, and generic helpers
- `src/services`: identity, storage, notification, and audit adapters when required
- `src/types`: genuinely cross-feature types
- `prisma`: schema, then migrations/seeds when the first slice is approved
