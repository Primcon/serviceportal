import { redirect } from "next/navigation";
import WorkspaceNavigation from "@/components/workspace-navigation";
import { managerRoles } from "@/features/navigation/workspace-items";
import { prisma } from "@/lib/prisma";
import { getWorkspaceViewer } from "@/services/page-access";
import { getRequestActor } from "@/services/request-actor";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await getRequestActor("employee");
  if (!actor) redirect("/api/auth/employee/login");
  const viewer = await getWorkspaceViewer();
  const pendingAccessRequests = viewer && managerRoles.includes(viewer.internalRole)
    ? await prisma.accessRequest.count({ where: { status: "PENDING" } })
    : 0;

  return (
    <div className="min-h-screen bg-surface lg:flex">
      <WorkspaceNavigation badges={{ pendingAccessRequests }} viewer={viewer ? { displayName: viewer.displayName, role: viewer.internalRole } : null} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
