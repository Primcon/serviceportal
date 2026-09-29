import Link from "next/link";
import { Bell, Settings } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { getCustomerNotificationHistory, getCustomerNotificationPreference } from "@/features/work-orders/customer-queries";
import { updateCustomerNotificationPreference } from "./actions";
import { getRequestActor } from "@/services/request-actor";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function notificationStatusLabel(status: "PENDING" | "SENT" | "FAILED" | "LOGGED") {
  return status === "LOGGED" ? "Recorded" : status[0] + status.slice(1).toLowerCase();
}

export default async function CustomerNotificationPanel() {
  const actor = await getRequestActor("customer");
  if (!actor) return null;
  const identitySubject = actor.identitySubject;
  const [notifications, emailUpdates] = await Promise.all([
    getCustomerNotificationHistory(identitySubject),
    getCustomerNotificationPreference(identitySubject),
  ]);

  return (
    <section className="mt-10 grid gap-8 border-t border-line pt-8 lg:grid-cols-[1fr_0.72fr]">
      <div>
        <div className="mb-4 flex items-center gap-2"><Bell size={19} className="text-brand" /><h2 className="text-xl font-bold">Notification history</h2></div>
        {notifications.length ? <div className="divide-y divide-line border-y border-line">{notifications.map((notification) => <Link className="block py-4 hover:text-brand" href={`/portal/work-orders/${notification.workOrder.id}`} key={notification.id}><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{notification.serviceUpdate?.title ?? "Service status changed"}</p><p className="mt-1 text-xs font-bold text-muted">{notificationStatusLabel(notification.status)}</p></div><time className="whitespace-nowrap text-xs text-muted">{formatDate(notification.createdAt)}</time></div><p className="mt-1 text-sm text-muted">{notification.workOrder.workOrderNumber} · {notification.workOrder.summary}</p>{notification.serviceUpdate?.body && <p className="mt-2 line-clamp-2 text-sm leading-6 text-body">{notification.serviceUpdate.body}</p>}</Link>)}</div> : <p className="border-y border-line py-6 text-sm text-muted">Notifications about your service activity will appear here.</p>}
      </div>
      <div>
        <div className="mb-4 flex items-center gap-2"><Settings size={19} className="text-brand" /><h2 className="text-xl font-bold">Notification preferences</h2></div>
        <ActionFeedbackForm action={updateCustomerNotificationPreference} className="border border-line bg-paper p-5" successMessage="Preferences saved."><label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 accent-brand" type="checkbox" name="emailUpdates" defaultChecked={emailUpdates ?? true} /> <span><span className="font-bold">Email service updates</span><span className="mt-1 block leading-6 text-muted">Allow VacTech to notify you when your service record changes.</span></span></label><button className="mt-5 bg-brand px-3 py-2.5 text-sm font-bold text-white">Save preferences</button></ActionFeedbackForm>
      </div>
    </section>
  );
}
