# Customer Notification Delivery

Customer-visible updates marked for notification and customer-facing status/condition changes create a durable notification record. Recipients are limited to active, opted-in customer users with either a company-wide grant or a matching location grant.

## Development

When Azure Communication Services Email is not configured, notifications have `LOGGED` status. They are visible in customer notification history but are not sent externally.

## Production Configuration

Set the following values through the production secret store:

- `AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING`
- `AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS`
- `NOTIFICATION_WORKER_SECRET`
- `APP_ORIGIN`

With the ACS connection string and sender address configured, new notification records begin in `PENDING` state. The dispatcher moves records to `SENT` after ACS accepts delivery, retries failed attempts with exponential backoff, and marks a record `FAILED` after five attempts.

## Azure Scheduled Job

Configure an Azure scheduled job to issue a `POST` request every minute to:

```text
https://<application-origin>/api/internal/notifications/dispatch?limit=25
```

Pass `NOTIFICATION_WORKER_SECRET` in the `x-notification-worker-secret` request header. The endpoint returns `404` when the secret is missing or invalid. The job must use a secret reference rather than embedding the value in its definition.

The dispatcher is idempotent per customer recipient and notification event. Monitor `FAILED` notifications and repeated pending backlog as operational alerts.