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

## Customer Status

Received and Intake Documentation map to Open. Initial Inspection, Evaluation, Quote Preparation, Repair Authorized through Shipped map to In Progress. Awaiting Customer Approval maps to Waiting. Completed maps to Completed.

Conditions remain independent of stage: Normal, Waiting on Parts, Awaiting Customer, Customer Hold, Warranty Review, Quote Declined, and Cancelled.

## Ownership and Handoffs

Each open work order is either with one person or waiting in the queue (nobody in particular). Any staff member can take a job, hand it to a colleague, or return it to the queue, with an optional handoff note. A stage change can hand the job on in the same step. Every handoff is kept in `WorkOrderAssignment` and shown on the timeline. Completing or cancelling a job clears its owner.

`WorkOrder.stageEnteredAt` restarts whenever the stage changes (not when only the condition does), and drives "days in stage".

- **My work** (`/workspace`): the jobs with the signed-in person, and the queue of unassigned jobs.
- **Stage board** (`/workspace/board`): every open job by stage, longest-waiting first, with the owner, days in stage and promised date. Dates past the promise show in red.
- The work order list filters by who has a job, open jobs only, and past the promised date.

## Activity

Intake eventually captures equipment identification, serial/nameplate and condition photos, container condition, accessories, paperwork, and visible damage. Completion may advance to Initial Inspection. Creation, uploads, updates, and stage changes generate audited timeline events; customer views show only customer-safe events.
