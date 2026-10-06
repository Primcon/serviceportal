import { Bell, FileText, Flag, MessageSquareText, Settings } from "lucide-react";
import type { NotificationKind } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, panelStyles } from "@/components/ui/styles";
import { markAllNotificationsRead, openNotification, updateCustomerNotificationPreference } from "@/features/customer/actions";
import { getCustomerNotificationPreferences, listCustomerNotifications } from "@/features/work-orders/customer-queries";
import { shopTimeZone } from "@/lib/dates";
import { pageFromParams, type SearchParams } from "@/lib/pagination";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTimeZone });

const kindIcons: Record<NotificationKind, typeof Bell> = { SERVICE_UPDATE: MessageSquareText, STATUS_CHANGE: Flag, DOCUMENT_SHARED: FileText, ACCESS: Bell };

const emailChoices = [
  { name: "emailUpdates", label: "Updates from your service team", detail: "When the team posts news about a repair and chooses to notify you." },
  { name: "emailStatusChanges", label: "Status changes", detail: "When a repair moves between Open, In progress, Waiting and Completed." },
  { name: "emailDocuments", label: "New documents", detail: "When a quote, report, invoice or other document is shared with you." },
] as const;

export default async function CustomerNotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const actor = await getRequestActor("customer");
  const [{ notifications, total, unread, page, pageSize }, preferences] = actor
    ? await Promise.all([listCustomerNotifications(actor.identitySubject, { page: pageFromParams(params) }), getCustomerNotificationPreferences(actor.identitySubject)])
    : [{ notifications: [], total: 0, unread: 0, page: 1, pageSize: 25 }, null];

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={unread > 0 && (
          <ActionFeedbackForm action={markAllNotificationsRead} className="flex flex-wrap items-center gap-2">
            <button className={buttonStyles({ variant: "outline", size: "sm" })}>Mark all as read</button>
          </ActionFeedbackForm>
        )}
        description="Everything your service team has told you about your repairs, newest first."
        eyebrow="NOTIFICATIONS"
        icon={<Bell size={16} />}
        title={unread ? `${unread} unread` : "Notifications"}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section className="border-y border-line bg-paper">
          {notifications.length ? (
            <ul className="divide-y divide-line">
              {notifications.map((notification) => {
                const Icon = kindIcons[notification.kind];
                const isUnread = !notification.readAt;
                return (
                  <li key={notification.id}>
                    {/* A form, so opening it can mark it read: page loads never change anything. */}
                    <form action={openNotification}>
                      <input name="notificationId" type="hidden" value={notification.id} />
                      <button className={`group grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 text-left hover:bg-surface ${isUnread ? "border-l-4 border-brand" : "border-l-4 border-transparent"}`}>
                        <Icon className={`mt-0.5 ${isUnread ? "text-brand" : "text-muted"}`} size={18} />
                        <span className="min-w-0">
                          <span className={`block group-hover:text-brand ${isUnread ? "font-bold" : ""}`}>{notification.subject}{isUnread && <span className="sr-only"> (unread)</span>}</span>
                          <span className="mt-1 line-clamp-2 block text-sm text-muted">{notification.body}</span>
                          {notification.workOrder && <span className="mt-1 block truncate text-xs text-subtle">{notification.workOrder.workOrderNumber} · {notification.workOrder.summary}</span>}
                        </span>
                        <time className="whitespace-nowrap text-xs text-muted" dateTime={notification.createdAt.toISOString()}>{day.format(notification.createdAt)}</time>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-5"><EmptyState description="Updates, status changes and new documents on your repairs will appear here." icon={<Bell size={24} />} title="No notifications yet." /></div>
          )}
          <Pagination label="notifications" page={page} pageSize={pageSize} params={params} pathname="/portal/notifications" total={total} />
        </section>

        <section className={panelStyles}>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Settings className="text-brand" size={18} /> Email me about</h2>
          <p className="mt-1 text-sm text-muted">Everything still appears on this page, whatever you choose here.</p>
          <ActionFeedbackForm action={updateCustomerNotificationPreference} className="mt-4 grid gap-4">
            {emailChoices.map((choice) => (
              <label className="flex items-start gap-3 text-sm" key={choice.name}>
                <input className="mt-0.5 size-4 accent-brand" defaultChecked={preferences?.[choice.name] ?? true} name={choice.name} type="checkbox" />
                <span><span className="font-bold">{choice.label}</span><span className="mt-0.5 block text-muted">{choice.detail}</span></span>
              </label>
            ))}
            <button className={buttonStyles({ size: "sm", className: "w-fit" })}>Save</button>
          </ActionFeedbackForm>
        </section>
      </div>
    </main>
  );
}
