import { redirect } from "next/navigation";
import PortalNavigation from "@/components/portal-navigation";
import { countUnreadNotifications } from "@/features/work-orders/customer-queries";
import { getRequestActor } from "@/services/request-actor";

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await getRequestActor("customer");
  if (!actor) redirect("/api/auth/customer/login");
  const unread = await countUnreadNotifications(actor.identitySubject);
  return <div className="min-h-screen bg-surface text-ink"><PortalNavigation unreadNotifications={unread} />{children}</div>;
}
