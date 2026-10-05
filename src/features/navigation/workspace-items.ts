import { UserRole } from "@prisma/client";
import { BookOpen, Building2, ClipboardList, KanbanSquare, FileSpreadsheet, Inbox, LayoutDashboard, Package, ScrollText, Settings, UsersRound, Workflow, type LucideIcon } from "lucide-react";

export const allInternalRoles: UserRole[] = [UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER, UserRole.VACTECH_QA, UserRole.VACTECH_SERVICE_USER];
export const managerRoles: UserRole[] = [UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER];

export type WorkspaceNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  /** Shows the pending access-request count next to the label. */
  badge?: "pendingAccessRequests";
};

export type WorkspaceNavigationGroup = { label: string; items: WorkspaceNavigationItem[] };

/** Every workspace page, grouped as it appears in the sidebar, with the roles that can open it. */
export const workspaceNavigation: WorkspaceNavigationGroup[] = [
  {
    label: "Service",
    items: [
      { href: "/workspace", label: "My work", icon: LayoutDashboard, roles: allInternalRoles },
      { href: "/workspace/board", label: "Stage board", icon: KanbanSquare, roles: allInternalRoles },
      { href: "/workspace/work-orders", label: "Work orders", icon: ClipboardList, roles: allInternalRoles },
      { href: "/workspace/equipment", label: "Equipment", icon: Package, roles: allInternalRoles },
      { href: "/workspace/models", label: "Models and manuals", icon: BookOpen, roles: allInternalRoles },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/workspace/customers", label: "Customers", icon: Building2, roles: managerRoles },
      { href: "/workspace/access-requests", label: "Access requests", icon: Inbox, roles: managerRoles, badge: "pendingAccessRequests" },
      { href: "/workspace/users", label: "Users", icon: UsersRound, roles: managerRoles },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/workspace/workflow", label: "Workflow", icon: Workflow, roles: managerRoles },
      { href: "/workspace/settings", label: "Settings", icon: Settings, roles: managerRoles },
      { href: "/workspace/reports", label: "Reports", icon: FileSpreadsheet, roles: managerRoles },
      { href: "/workspace/audit", label: "Audit", icon: ScrollText, roles: managerRoles },
    ],
  },
];

/** The sidebar groups a role can see, with empty groups removed. */
export function navigationForRole(role: UserRole | null) {
  if (!role) return [];
  return workspaceNavigation
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}
