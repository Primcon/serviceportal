# Permissions

| Role | MVP capability |
| --- | --- |
| Portal Administrator | Full access and system administration |
| VacTech Manager | Work orders, equipment, customers, users, access requests |
| VacTech Service User | Work orders, equipment, updates, photos, documents, findings, allowed stages |
| Customer User | Read-only customer-visible records for authorized company data |

## Rules

- Every protected server request identifies an active user; disabled users lose access immediately.
- Customer authorization comes from `UserAccess`, not a company ID from the browser.
- Customer work-order reads require a company grant and filter all related updates, findings, attachments, documents, and activity to customer-visible content.
- Internal-only data is never serialized in a customer response, even when an identifier is guessed.
- Pending access requests do not grant access. An administrator must assign company, role, and activation deliberately.
- Inputs are validated server-side with Zod. Important administrative, work-order, update, and attachment activity is audited.

## Employee Roles

Employee roles are managed in the portal on the Users page. Microsoft Entra decides who may sign in; the portal decides what they can do.

- Turn on **Assignment required** for the employee enterprise application in Entra. Only assigned employees can sign in. Removing an assignment blocks sign-in.
- On an employee's first sign-in, their Entra app role (`Portal.Administrator`, `VacTech.Manager`, or `VacTech.ServiceUser`) sets their starting portal role. An employee without one of these roles on first sign-in is refused.
- After that, the portal role is the only one that counts. Changing the Entra app role has no effect, and an employee no longer needs one.
- Managers can change the roles and access of managers and service users. Only a portal administrator can change another administrator, and the last active administrator can't be demoted or disabled.

## File Access

Files remain private. The application authorizes the requesting user against the attachment's work order and visibility before returning a short-lived storage authorization or proxying content. Permanent public blob URLs are prohibited.
