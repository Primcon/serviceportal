import type { UserRole } from "@prisma/client";

/**
 * An account created before the person has ever signed in has a placeholder where its
 * sign-in identity will go. The first sign-in with the matching verified email address
 * replaces the placeholder. An account that already has a real identity is never taken
 * over by a different one.
 */
export const invitedIdentityPrefix = "invited:";
export const relinkIdentityPrefix = "relink:";
const placeholderPrefixes = [invitedIdentityPrefix, relinkIdentityPrefix, "customer:", "wordpress:"];

export function isPlaceholderIdentity(identitySubject: string) {
  return placeholderPrefixes.some((prefix) => identitySubject.startsWith(prefix));
}

export type LinkDecision = "link" | "refuse-linked-elsewhere" | "refuse-staff-account" | "refuse-customer-account";

/**
 * Whether a sign-in may claim an existing account found by email address.
 * - Customer sign-in never claims a staff account, and staff sign-in never claims an
 *   account that holds customer access: the two never cross.
 * - Otherwise it may claim an account that's still waiting on a placeholder, and nothing else.
 */
export function decideEmailLink(account: { identitySubject: string; internalRole: UserRole | null; hasCustomerAccess: boolean }, audience: "customer" | "employee"): LinkDecision {
  if (audience === "customer" && account.internalRole) return "refuse-staff-account";
  if (audience === "employee" && !account.internalRole && account.hasCustomerAccess) return "refuse-customer-account";
  return isPlaceholderIdentity(account.identitySubject) ? "link" : "refuse-linked-elsewhere";
}

export const linkRefusalMessages: Record<Exclude<LinkDecision, "link">, string> = {
  "refuse-linked-elsewhere": "This email address is already linked to a different sign-in. Ask your service team to reset the sign-in link on your account.",
  "refuse-staff-account": "This email address belongs to a staff account. Use the staff sign-in.",
  "refuse-customer-account": "This email address belongs to a customer account. Use the customer sign-in.",
};
