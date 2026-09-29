# Data Model

The schema is in [prisma/schema.prisma](../prisma/schema.prisma), and every change goes through a migration in [prisma/migrations](../prisma/migrations). Applied migration files must never be edited; git stores them byte-for-byte (see `.gitattributes`) because Prisma checksums them.

## Core Relationships

```text
Company -> Location -> Equipment -> WorkOrder
ProductModel -> Equipment
ServiceCenter -> WorkOrder
Company -> UserAccess -> User
WorkOrder -> ServiceUpdate | Finding | Attachment | WorkOrderStatusHistory | AuditEvent
```

A company owns locations, equipment, work orders, and access grants. Equipment belongs to a company and optional location and has many work orders. Serial numbers are unique per company (ignoring case), not globally. Work-order numbers are unique within a company.

`UserAccess` is separate from identity and grants a company role, with an optional location for location-scoped customer access. A disabled `User` is rejected before protected access.

## Catalog and Configuration

- `ProductModel` is the catalog of manufacturer + model pairs (for example Edwards IL70N), unique ignoring case. Each pump links to one. `Equipment.productModel` keeps the display name in step with it. Manuals, and later warranty terms, attach per model.
- `ServiceCenter` is a VacTech facility. Its code is the suffix on work order (WIP) numbers, such as AZ in "48366 AZ", and can't change once work orders use it.
- `ListOption` holds the editable priority and service-type picklists. Work orders store the chosen label as text, so imported values and retired options survive list changes.

These are managed on the workspace Settings page. Entries are retired (made inactive) rather than deleted.

## Work Order Intake

Work orders carry the intake details from job order form 852-01-01: tool ID, oil type and weight, reason for service, contaminants, copper/non-copper classification, accessories received, and a customer contact for the repair. They also have a customer PO, RMA reference, promised date, and service center.

## Workflow and Visibility

`ServiceStage` is editable configuration data with sequence and customer-status mapping. `WorkOrder.condition` represents temporary conditions separately. `WorkOrderStatusHistory` records each stage/condition change.

Updates, findings, and attachments hold explicit `INTERNAL_ONLY` or `CUSTOMER_VISIBLE` visibility. `WorkOrder.customerFacingStatus` is stored for efficient filtering and is kept in step with its stage, including when a stage's mapping changes.

## Attachments and Audit

`Attachment` supports photos and documents with private original, optimized, and thumbnail storage keys, metadata, category or document type, visibility, caption, uploader, and optional equipment/stage associations. It never stores file binaries or public URLs. Document types include invoices, manuals, warranty certificates and signed travelers.

`AuditEvent` records system activity, written in the same transaction as the change it describes. Only deliberately customer-safe events appear in the customer timeline.

## Archiving and Migration

Customers, locations and equipment have an `archivedAt` date: archived records drop out of pickers and default lists but keep their history.

Records that can be imported from the WordPress portal (companies, locations, users, equipment, work orders, attachments) have `legacySource` and `legacyId`, unique together, so the import can be re-run without creating duplicates.
