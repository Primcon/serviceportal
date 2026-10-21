import { ArrowRightLeft, Bell, Settings, ShieldAlert } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, panelStyles } from "@/components/ui/styles";
import { markAllStaffNotificationsRead, openStaffNotification, saveHandoffEmailPreference } from "@/features/staff-notifications/actions";
import { listStaffNotifications } from "@/features/staff-notifications/queries";
import { shopTimeZone } from "@/lib/dates";
import { pageFromParams, type SearchParams } from "@/lib/pagination";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: shopTimeZone });

export default async function StaffNotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireWorkspaceUser();
  const params = await searchParams;
  const { notifications, total, unread, page, pageSize, emailHandoffs } = await listStaffNotifications(viewer.id, { page: pageFromParams(params) });

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        actions={unread > 0 && (
          <ActionFeedbackForm action={markAllStaffNotificationsRead} className="flex flex-wrap items-center gap-2">
            <button className={buttonStyles({ variant: "outline", size: "sm" })}>Mark all as read</button>
          </ActionFeedbackForm>
        )}
        description="Jobs handed to you and warranty claims waiting for your decision, newest first."
        eyebrow="SERVICE"
        icon={<Bell size={16} />}
        title={unread ? `${unread} unread` : "Notifications"}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className="border-y border-line bg-paper">
          {notifications.length ? (
            <ul className="divide-y divide-line">
              {notifications.map((notification) => {
                const Icon = notification.eventKey.startsWith("warranty-claim:") ? ShieldAlert : ArrowRightLeft;
                const isUnread = !notification.readAt;
                return (
                  <li key={notification.id}>
                    {/* A form, so opening it can mark it read: page loads never change anything. */}
                    <form action={openStaffNotification}>
                      <input name="notificationId" type="hidden" value={notification.id} />
                      <button className={`group grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 text-left hover:bg-surface ${isUnread ? "border-l-4 border-brand" : "border-l-4 border-transparent"}`}>
                        <Icon className={`mt-0.5 ${isUnread ? "text-brand" : "text-muted"}`} size={18} />
                        <span className="min-w-0">
                          <span className={`block group-hover:text-brand ${isUnread ? "font-bold" : ""}`}>{notification.subject}{isUnread && <span className="sr-only"> (unread)</span>}</span>
                          <span className="mt-1 line-clamp-3 block whitespace-pre-line text-sm text-muted">{notification.body}</span>
                        </span>
                        <time className="whitespace-nowrap text-xs text-muted" dateTime={notification.createdAt.toISOString()}>{when.format(notification.createdAt)}</time>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-5"><EmptyState description="When someone hands you a job, or a warranty claim needs your decision, it appears here." icon={<Bell size={24} />} title="Nothing yet." /></div>
          )}
          <Pagination label="notifications" page={page} pageSize={pageSize} params={params} pathname="/workspace/notifications" total={total} />
        </section>

        <section className={panelStyles}>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Settings className="text-brand" size={18} /> Email</h2>
          <p className="mt-1 text-sm text-muted">Warranty claims to decide are always emailed to approvers.</p>
          <ActionFeedbackForm action={saveHandoffEmailPreference} className="mt-4 grid gap-4" key={String(emailHandoffs)}>
            <label className="flex items-start gap-3 text-sm">
              <input className="mt-0.5 size-4 accent-brand" defaultChecked={emailHandoffs} name="emailHandoffs" type="checkbox" />
              <span><span className="font-bold">Email me when a job is handed to me</span><span className="mt-0.5 block text-muted">It always shows here and on My work either way.</span></span>
            </label>
            <button className={buttonStyles({ size: "sm", className: "w-fit" })}>Save</button>
          </ActionFeedbackForm>
        </section>
      </div>
    </main>
  );
}
