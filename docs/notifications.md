# Customer Notification Delivery

Customer-visible updates marked for notification create a durable notification record. A work-order status change creates one only when the status customers see changes (Open, In progress, Waiting, Completed). Moves between internal stages that share a customer status, and condition changes, don't email customers. Recipients are limited to active, opted-in customer users with either a company-wide grant or a matching location grant.

Status emails name the new customer status and link to the repair in the portal. They never include internal stage names or conditions.

## Development

When Azure Communication Services Email is not configured, notifications have `LOGGED` status. They are visible in customer notification history but are not sent externally.

## Production Configuration

Set the following values through the production secret store:

- `AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING`
- `AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS`
- `NOTIFICATION_WORKER_SECRET`
- `APP_ORIGIN`

With the ACS connection string and sender address configured, new notification records begin in `PENDING` state. The dispatcher moves records to `SENT` after ACS accepts delivery, retries failed attempts with exponential backoff, and marks a record `FAILED` after five attempts.

Before sending, the dispatcher claims each notification by moving its next attempt time forward ten minutes. Only one run can win the claim, so overlapping dispatcher runs never send the same email twice. If a run stops after claiming, the notification is retried once the ten minutes pass.

## Azure Container Apps Job

Apply [notification-dispatch-job-staging.yaml](../deploy/notification-dispatch-job-staging.yaml) as a Container Apps Job after replacing its staging values with the target subscription, resource group, managed environment, Key Vault, and application origin. It runs every minute and invokes:

```text
POST /api/internal/notifications/dispatch?limit=25
x-notification-worker-secret: <NOTIFICATION_WORKER_SECRET>
```

The endpoint returns `404` when the secret is missing or invalid. Grant the job's system-assigned managed identity permission to read the `notification-worker-secret` Key Vault secret. The job must use a secret reference rather than embedding the value in its definition.

The dispatcher is idempotent per customer recipient and notification event. Monitor `FAILED` notifications and repeated pending backlog as operational alerts.
