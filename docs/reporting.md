# Reporting

Internal users with the Portal Administrator or VacTech Manager role can download Work Order, Equipment, and Audit Event reports from `/workspace/reports`. Each download is recorded in the audit trail.

## Scheduled reports

Schedules use a selected first delivery date, local time, IANA time zone, and daily, weekly, or monthly recurrence. The selected time zone is retained for every future occurrence, including daylight-saving changes. A report contains records in its configured date range when set; otherwise it contains all matching records.

Scheduled deliveries send an `.xlsx` attachment through Azure Communication Services Email. The dispatcher claims a due schedule before delivery to prevent duplicate sends. Failed deliveries retry after five minutes and display their latest error in the reporting workspace.

Recipients are free-text email addresses by accepted product decision. This can send customer and service data outside VacTech; administrators must use only authorized recipient addresses. A schedule allows up to 20 distinct, valid email addresses.

## Configuration

Set these values through Key Vault and reference them from the application:

- `AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING`
- `AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS`
- `REPORT_WORKER_SECRET` (a unique random value of at least 32 characters)

The application uses `REPORT_WORKER_SECRET` to authenticate internal dispatch calls. It must be different from `NOTIFICATION_WORKER_SECRET`.

## Azure Container Apps Job

Apply [report-dispatch-job-staging.yaml](../deploy/report-dispatch-job-staging.yaml) as a Container Apps Job after replacing its staging values with the target subscription, resource group, managed environment, Key Vault, and application origin. The job runs every five minutes and invokes:

```text
POST /api/internal/reports/dispatch?limit=10
x-report-worker-secret: <REPORT_WORKER_SECRET>
```

Grant the job's system-assigned managed identity permission to read the `report-worker-secret` Key Vault secret. The application container identity needs the same permission. Monitor failed job executions, schedules with `FAILED` last-run status, and schedules whose `nextRunAt` remains overdue.