# Workflow

## Internal Stages

1. Received
2. Intake Documentation
3. Initial Inspection
4. Evaluation
5. Quote Preparation
6. Awaiting Customer Approval
7. Repair Authorized
8. Repair In Progress
9. Testing
10. Final Inspection
11. Ready to Ship
12. Shipped
13. Completed

Stages are database configuration records, not embedded feature code.

## What Customers See

Customers never see internal stage names, conditions or handoff notes.

- **Progress tracker.** Each stage has a `customerLabel`, the step customers are shown. Stages that share a label are one step, so the 13 standard stages appear as seven: Received, Inspection, Quote, Repair, Testing, Shipping, Complete. Managers edit the labels on the Workflow page; a stage with no label shows its own name. The tracker dates each step from the first time the job reached it.
- **Holding conditions** appear as a plain notice (`customerConditionNotices` in `src/features/customer/progress.ts`), such as "Waiting on parts" or "We need something from you".
- **The repair page** shows updates, shared findings, shared photos grouped by the point in the repair they were taken, shared documents with the final service report first, the promised date as "Expected by", and the service center's contact details when they're set in Settings.
- **Download all** (`/api/work-orders/<id>/files`) is one zip of every shared document and photo on a repair. Photos go in as their viewing copies.
- Customers with more than one company can filter their repairs by company.

## Customer Status

Received and Intake Documentation map to Open. Initial Inspection, Evaluation, Quote Preparation, Repair Authorized through Shipped map to In Progress. Awaiting Customer Approval maps to Waiting. Completed maps to Completed.

Conditions remain independent of stage: Normal, Waiting on Parts, Awaiting Customer, Customer Hold, Warranty Review, Quote Declined, and Cancelled.

## Ownership and Handoffs

Each open work order is either with one person or waiting in the queue (nobody in particular). Any staff member can take a job, hand it to a colleague, or return it to the queue, with an optional handoff note. A stage change can hand the job on in the same step. Every handoff is kept in `WorkOrderAssignment` and shown on the timeline. Completing or cancelling a job clears its owner.

`WorkOrder.stageEnteredAt` restarts whenever the stage changes (not when only the condition does), and drives "days in stage".

- **My work** (`/workspace`): the jobs with the signed-in person, and the queue of unassigned jobs.
- **Stage board** (`/workspace/board`): every open job by stage, longest-waiting first, with the owner, days in stage and promised date. Dates past the promise show in red.
- The work order list filters by who has a job, open jobs only, and past the promised date.

## Checklists and Sign-offs

The steps of the job order form are a **checklist template** that carries the form number and revision (today 852-01-01 Rev. 9). Each step belongs to a workflow stage and is one of three kinds: a sign-off, a reading with a unit (such as a helium leak rate), or a list of items each marked done or N/A. A step can be reserved for QA and can be optional.

- **Signing** records the signed-in person and the time, in place of initials and a date. A step that doesn't apply to a job can be marked not applicable, with a reason. The signer or a manager can clear a sign-off. Every sign-off, clearing and override is in the audit log. A closed job's checklist can't be changed.
- **Gate:** a job can't move forward to a stage while a required step of an earlier stage is unsigned. Moving backward, changing only the condition, and cancelling are never held up. A manager can move a job on anyway by giving a reason, which is stored on the stage change (`overrideReason`) and shown on the timeline.
- **Revisions:** a new work order takes the active revision and keeps it for life (`WorkOrder.checklistTemplateId`). A revision is locked once any work order uses it; to change steps, managers create a new revision (a copy), edit it, and make it active. Jobs already open stay on their revision.
- The starting checklist's steps and QA requirements (`src/features/checklists/default-template.ts`) are a first draft from the paper form, to be confirmed by VacTech. The form's parts and quote lines are tracked separately.
- Work orders opened before checklists existed have none until someone chooses "Start the checklist" on them.

## Parts, Quote and the Traveler

The parts section of the job order form is on the work order: parts required (free text, one per line), kit (none, minor, major), extra labor hours, and the dates the customer was quoted and parts were ordered and received. Whoever records parts as received is taken as the person who inspected them unless someone else is chosen. These don't change the stage or condition by themselves; staff still set "Waiting on parts" or "Awaiting customer".

The **traveler** (`/workspace/work-orders/<id>/traveler`) is the printable job order form: the intake details, the handling warning, every checklist step with the initials, dates and readings already signed in the portal, the parts and quote lines, and the form number and revision in the footer. Unsigned steps print blank to be initialed by hand. A QR code opens the work order (it uses `APP_ORIGIN`). It's sized for one letter page on a typical job; a very long checklist or parts list runs onto a second. A hand-signed copy can be scanned back in as a "Signed traveler" document.

## Operations Dashboard and Audit Log

**Operations** (`/workspace/dashboard`, managers) shows live counts: open jobs, jobs past the promised date, jobs waiting on parts or the customer, jobs completed this week, and the median days from receipt to completion over the last 30 days. Below that: open jobs by stage with the typical time in each, jobs opened and completed in each of the last eight weeks (Monday to Sunday in the shop's time zone), open jobs by age, and open jobs per person. Bars link to the matching work order list. Charts use the `chart-1`/`chart-2` colors from `globals.css`, which were checked together for colorblind separation; red is kept for warnings.

**Audit log** (`/workspace/audit`, managers) lists every recorded event in plain language (`src/features/audit/describe.ts` maps event types to titles and details to labels). Edits show as "from → to". It filters by kind of activity, person, date range (shop days) and manager overrides, and searches by WIP number, person or event. A new event type needs a title added there; without one it still shows, as its words.

## Activity

Intake eventually captures equipment identification, serial/nameplate and condition photos, container condition, accessories, paperwork, and visible damage. Completion may advance to Initial Inspection. Creation, uploads, updates, and stage changes generate audited timeline events; customer views show only customer-safe events.
