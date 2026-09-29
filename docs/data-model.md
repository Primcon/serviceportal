# Data Model

## Core Relationships

```text
Company -> Location -> Equipment -> WorkOrder
Company -> UserAccess -> User
WorkOrder -> ServiceUpdate | Finding | Attachment | WorkOrderStatusHistory | AuditEvent
```

A company owns locations, equipment, work orders, and access grants. Equipment belongs to a company and optional location and has many work orders. Serial numbers are indexed per company, not globally unique. Work-order numbers are manually entered and unique within a company.

`UserAccess` is separate from identity and grants a company role, with an optional location for future location-scoped permissions. A disabled `User` is rejected before protected access.

## Workflow and Visibility

`ServiceStage` is editable configuration data with sequence and customer-status mapping. `WorkOrder.condition` represents temporary conditions separately. `WorkOrderStatusHistory` records each stage/condition change.

Updates, findings, and attachments hold explicit `INTERNAL_ONLY` or `CUSTOMER_VISIBLE` visibility. `WorkOrder.customerFacingStatus` is stored for efficient filtering and is synchronized from its selected stage in the work-order service.

## Attachments and Audit

`Attachment` supports photos and documents with private original, optimized, and thumbnail storage keys, metadata, category/type, visibility, actor, and optional equipment/stage associations. It never stores file binaries or public URLs.

`AuditEvent` records system activity. Only deliberately customer-safe events can appear in the customer timeline. The proposed Prisma implementation is [prisma/schema.prisma](../prisma/schema.prisma); migrations are deferred until the first-slice model review.
