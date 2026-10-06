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

- `ProductModel` is the catalog of manufacturer + model pairs (for example Edwards IL70N), unique ignoring case. Each pump links to one. `Equipment.productModel` keeps the display name in step with it, including when a model is renamed or merged. Managers maintain the catalog on the Models and manuals page; a duplicate model is merged into the one being kept and then removed.
- `ModelDocument` is a manual or other document attached to a model. It's available to staff on every pump and work order of that model. One marked customer-visible is also offered to customers who have a pump of that model.
- `ServiceCenter` is a VacTech facility. Its code is the suffix on work order (WIP) numbers, such as AZ in "48366 AZ", and can't change once work orders use it.
- WIP numbers are assigned by the portal at intake, not typed. The `NumberSequence` row "work-order" holds the next number; intake increments it inside its transaction (the row lock keeps simultaneous intakes from sharing a number, and a failed intake gives its number back) and skips any number already on a work order, such as an imported one. Managers set the next number in Settings, for example to carry on from WordPress at go-live, and it can't be set at or below the highest number in use. Whether the suffix really means the facility is still being confirmed with VacTech.
- `ListOption` holds the editable priority and service-type picklists. Work orders store the chosen label as text, so imported values and retired options survive list changes.

These are managed on the workspace Settings page. Entries are retired (made inactive) rather than deleted.

## Work Order Intake

Work orders carry the intake details from job order form 852-01-01: tool ID, oil type and weight, reason for service, contaminants, copper/non-copper classification, accessories received, and a customer contact for the repair. They also have a customer PO, RMA reference, promised date, and service center.

## Checklists

`ChecklistTemplate` (form number + revision, one active) has `ChecklistTemplateStep` rows, each tied to a `ServiceStage`. `WorkOrderStepRecord` is a signed step on one work order: who, when, and any reading, item results or note; one per step per work order. See [workflow.md](workflow.md) for the rules.

## Workflow and Visibility

`ServiceStage` is editable configuration data with sequence and customer-status mapping. `WorkOrder.condition` represents temporary conditions separately. `WorkOrderStatusHistory` records each stage/condition change.

Updates, findings, and attachments hold explicit `INTERNAL_ONLY` or `CUSTOMER_VISIBLE` visibility. `WorkOrder.customerFacingStatus` is stored for efficient filtering and is kept in step with its stage, including when a stage's mapping changes.

## Attachments and Audit

`Attachment` supports photos and documents with private original, optimized, and thumbnail storage keys, metadata, category or document type, visibility, caption, uploader, and optional equipment/stage associations. It never stores file binaries or public URLs. A photo uploaded since October 2026 has `originalArchivedAt` set: its original is in archive storage and only the optimized copy and thumbnail are served (see File Storage in [deployment.md](deployment.md)). HEIC photos from iPhones are accepted; their viewing copies are converted like any other. Document types include invoices, manuals, warranty certificates and signed travelers.

`AuditEvent` records system activity, written in the same transaction as the change it describes. Only deliberately customer-safe events appear in the customer timeline.

## Archiving and Migration

Customers, locations and equipment have an `archivedAt` date: archived records drop out of pickers and default lists but keep their history. A customer or pump with an open work order can't be archived.

## Merging Duplicates

A duplicate customer or pump is merged into the one being kept (see `src/features/records/merge.ts`). Its records move across, and the duplicate stays behind, archived, with `mergedIntoId` pointing at the kept record. It isn't deleted because it may carry a `legacyId` that an import needs to resolve.

- **Pumps** must belong to the same customer. Work orders and files move to the kept pump, which also takes any details it was missing.
- **Customers:** locations, pumps, work orders, access requests and customer logins move across. A location with a name the kept customer already has is combined with it, and a pump with a serial number it already has is merged into that pump. The merge stops if both customers have a work order with the same number.
- A merged record can't be restored, edited or merged again, and customers never see it.

Records that can be imported from the WordPress portal (companies, locations, users, equipment, work orders, attachments) have `legacySource` and `legacyId`, unique together, so the import can be re-run without creating duplicates.
