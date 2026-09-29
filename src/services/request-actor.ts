import { getSessionActor, type AuthenticatedActor } from "@/services/entra-auth";
import { getDevelopmentActor, type DevelopmentActor } from "@/services/development-identity";

export type RequestAudience = "customer" | "employee";

export async function getRequestActor(audience: RequestAudience): Promise<AuthenticatedActor | DevelopmentActor | null> {
  const sessionActor = await getSessionActor();
  if (sessionActor?.audience === audience) return sessionActor;

  if (process.env.NODE_ENV !== "production" && process.env.AUTH_MODE !== "entra") {
    return getDevelopmentActor(audience === "customer" ? "customer" : "internal");
  }

  return null;
}
