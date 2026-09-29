import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { AccessDeniedError } from "@/lib/errors";
import { allInternalRoles } from "@/features/navigation/workspace-items";
import { getActiveInternalUserForRoles } from "@/services/authorization";

/**
 * Guards a workspace page. Returns the signed-in employee when their role may open the
 * page, and otherwise sends them to the "no access" page instead of an error screen.
 */
export async function requireWorkspaceUser(roles: UserRole[] = allInternalRoles) {
  try {
    return await getActiveInternalUserForRoles(roles);
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/workspace/no-access");
    throw error;
  }
}

/** The signed-in employee for the workspace chrome, or null when they have no active internal role. */
export async function getWorkspaceViewer() {
  try {
    return await getActiveInternalUserForRoles(allInternalRoles);
  } catch (error) {
    if (error instanceof AccessDeniedError) return null;
    throw error;
  }
}
