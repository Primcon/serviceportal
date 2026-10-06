# Permissions

The portal has four staff roles and one customer role. Each staff role includes everything the roles to its right can do.

| What | Administrator | Manager | Quality assurance | Technician |
| --- | :---: | :---: | :---: | :---: |
| See work orders, pumps, models and manuals | Yes | Yes | Yes | Yes |
| Open work orders, add pumps, correct a pump's details | Yes | Yes | Yes | Yes |
| Post updates, notes and findings; upload photos and documents | Yes | Yes | Yes | Yes |
| Change a work order's stage and condition | Yes | Yes | Yes | Yes |
| Take a job, hand it to someone, return it to the queue | Yes | Yes | Yes | Yes |
| Delete a photo | Any | Any | Own | Own |
| Sign checklist steps; mark a step not applicable | Yes | Yes | Yes | Yes |
| Sign the checklist steps reserved for QA | Yes | Yes | Yes | No |
| Clear a checklist sign-off | Any | Any | Own | Own |
| Move a job on with required steps unsigned (override, with a reason) | Yes | Yes | No | No |
| Checklists: edit steps, create revisions, choose the active one | Yes | Yes | No | No |
| Change document visibility; delete documents | Yes | Yes | No | No |
| Customers and locations: add, rename, archive, merge | Yes | Yes | No | No |
| Archive or merge pumps | Yes | Yes | No | No |
| Model catalog: add, correct, retire, merge; upload manuals | Yes | Yes | No | No |
| Users, access requests and customer access | Yes | Yes | No | No |
| Workflow stages, settings, reports, audit log | Yes | Yes | No | No |
| Change or disable an administrator | Yes | No | No | No |

**Customers** see only customer-visible records for the companies or locations they've been granted, and can't change anything except their own notification preferences.

In the code the roles are `PORTAL_ADMINISTRATOR`, `VACTECH_MANAGER`, `VACTECH_QA`, `VACTECH_SERVICE_USER` (Technician) and `CUSTOMER_USER`.

## Rules

- Every protected server request identifies an active user; disabled users lose access immediately.
- Customer authorization comes from `UserAccess`, not a company ID from the browser.
- Customer work-order reads require a company grant and filter all related updates, findings, attachments, documents, and activity to customer-visible content.
- A customer's search only narrows their own records. Access rules and search terms are combined with AND, never spread into one filter object, because both are OR lists and one would replace the other.
- Internal-only data is never serialized in a customer response, even when an identifier is guessed.
- Pending access requests do not grant access. An administrator must assign company, role, and activation deliberately.
- Inputs are validated server-side with Zod. Important administrative, work-order, update, and attachment activity is audited.

## Employee Roles

Employee roles are managed in the portal on the Users page. Microsoft Entra decides who may sign in; the portal decides what they can do.

- Turn on **Assignment required** for the employee enterprise application in Entra. Only assigned employees can sign in. Removing an assignment blocks sign-in.
- On an employee's first sign-in, their Entra app role (`Portal.Administrator`, `VacTech.Manager`, `VacTech.QualityAssurance`, or `VacTech.ServiceUser`) sets their starting portal role. An employee without one of these roles on first sign-in is refused.
- After that, the portal role is the only one that counts. Changing the Entra app role has no effect, and an employee no longer needs one.
- Managers can change the roles and access of managers, QA and technicians. Only a portal administrator can change another administrator, and the last active administrator can't be demoted or disabled.

## File Access

Model manuals follow the same rule: staff can download any of them, and a customer only one that is marked customer-visible for a model they have a pump of.

Customers are only ever sent a photo's compressed viewing copy or thumbnail. Any staff member can request a photo's archived original; each request is recorded in the audit log.

Route handlers that change data (photo upload, requesting an original) check that the request came from the portal's own origin, the protection server actions get from Next.js.

Files remain private. The application authorizes the requesting user against the attachment's work order and visibility before returning a short-lived storage authorization or proxying content. Permanent public blob URLs are prohibited.
