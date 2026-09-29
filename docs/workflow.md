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

## Activity

Intake eventually captures equipment identification, serial/nameplate and condition photos, container condition, accessories, paperwork, and visible damage. Completion may advance to Initial Inspection. Creation, uploads, updates, and stage changes generate audited timeline events; customer views show only customer-safe events.
