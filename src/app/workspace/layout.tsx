import { redirect } from "next/navigation";
import WorkspaceNavigation from "@/components/workspace-navigation";
import { getRequestActor } from "@/services/request-actor";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await getRequestActor("employee");
  if (!actor) redirect("/api/auth/employee/login");
  return <><WorkspaceNavigation />{children}</>;
}
