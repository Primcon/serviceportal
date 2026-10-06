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

Emails still queued 48 hours after they were created are out of date, so each dispatcher run marks them `FAILED` with an "Expired" error instead of sending them. This keeps a backlog, after an outage or from before the dispatcher first ran, from reaching customers as a burst of stale messages.

Before sending, the dispatcher claims each notification by moving its next attempt time forward ten minutes. Only one run can win the claim, so overlapping dispatcher runs never send the same email twice. If a run stops after claiming, the notification is retried once the ten minutes pass.

## Azure Container Apps Job

Apply [notification-dispatch-job-staging.yaml](../deploy/notification-dispatch-job-staging.yaml) as a Container Apps Job after replacing its staging values with the target subscription, resource group, managed environment, Key Vault, and application origin. It runs every minute and invokes:

```text
POST /api/internal/notifications/dispatch?limit=25
x-notification-worker-secret: <NOTIFICATION_WORKER_SECRET>
```

The endpoint returns `404` when the secret is missing or invalid. Grant the job's system-assigned managed identity permission to read the `notification-worker-secret` Key Vault secret. The job must use a secret reference rather than embedding the value in its definition.

The dispatcher is idempotent per customer recipient and notification event. Monitor `FAILED` notifications and repeated pending backlog as operational alerts.

## The Customer's Feed and Email Choices

Every notification about a repair is stored once per customer who can see that repair (`Notification.userId`), whether or not it's emailed. Those rows are the customer's feed at `/portal/notifications`, with an unread count in the navigation (`readAt` empty means unread). Opening an item marks it read; that happens through a form post, because page loads never change anything.

There are three kinds customers receive, each with its own email setting in `NotificationPreference`:

| Kind | Raised when | Email setting |
| --- | --- | --- |
| `SERVICE_UPDATE` | Staff post a customer update and tick "notify" | `emailUpdates` |
| `STATUS_CHANGE` | The status customers see changes | `emailStatusChanges` |
| `DOCUMENT_SHARED` | A document is uploaded as, or switched to, customer-visible (once per document) | `emailDocuments` |

A customer who has turned a kind off still gets the feed item; its row is stored with status `OPTED_OUT` and the dispatcher never sends it. A daily digest isn't built.

## Access Emails

`ACCESS` notifications aren't about a repair (`workOrderId` is empty) and can't be turned off: a new access request goes to every active manager and administrator, the requester is told when it's approved or declined, and an invited customer gets sign-in instructions. They use the same outbox, so they're retried and never sent twice.

## Email Format

Emails are sent as HTML with a plain-text version (`src/services/email-template.ts`): the logo, the subject as a heading, the message, and one button built from `linkPath` and `APP_ORIGIN`. The logo is loaded from `APP_ORIGIN/pfeiffer-vacuum-logo.png`, so that address must be reachable from the internet. Message text is escaped.

Emails a customer can turn off end with two links: their settings page, and `/unsubscribe?token=...`, which stops that one kind without signing in. The token is the user and kind, signed with `AUTH_SESSION_SECRET` (`src/services/unsubscribe.ts`). The page asks before changing anything, so a mail scanner that follows links can't unsubscribe someone.
