# VacTech Service Portal Instructions

- Preserve the standalone Next.js, PostgreSQL, Prisma, Azure-ready modular-monolith architecture. Do not add ERP/FSM integrations, microservices, or custom password storage without explicit approval.
- Model Company -> Location -> Equipment -> Work Order. Equipment has many historical work orders; serial numbers are important lookup keys but not globally unique.
- Enforce customer authorization on the server and in every data query. Customer users may read only records for an authorized company and only customer-visible content. Never rely on hidden UI controls.
- Keep customer-facing status separate from adjustable internal service stages, and keep temporary conditions separate from stages. Do not hard-code workflow stages where configuration data is appropriate.
- Store attachment metadata and private object-storage keys, never binaries or permanent public URLs. Authorize every file delivery.
- Disabled users must lose access immediately. Audit important administrative and work-order actions. Validate server boundaries with Zod.
- Use readable TypeScript and feature-oriented modules. Avoid speculative abstractions and large UI dependencies.
- The current feature scope is Company -> Equipment -> Work Order -> Customer-visible Update -> Customer Work Order View. Do not expand beyond it until it works end-to-end.
