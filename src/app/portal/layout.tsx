import { redirect } from "next/navigation";
import PortalNavigation from "@/components/portal-navigation";
import { getRequestActor } from "@/services/request-actor";

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await getRequestActor("customer");
  if (!actor) redirect("/api/auth/customer/login");
  return <><PortalNavigation />{children}</>;
}
