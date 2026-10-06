import { createHmac, timingSafeEqual } from "node:crypto";
import { NotificationKind } from "@prisma/client";

/**
 * Links in emails that let a customer stop one kind of email without signing in. The link
 * carries the user and the kind, signed with the portal's secret so it can't be forged or
 * changed to point at someone else.
 */

function secret() {
  const value = process.env.AUTH_SESSION_SECRET;
  // Development has no secret configured; links made there only ever work there.
  return value && value.length >= 32 ? value : "development-only-unsubscribe-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(`unsubscribe:${payload}`).digest("base64url");
}

export function unsubscribeToken(userId: string, kind: NotificationKind) {
  const payload = Buffer.from(`${userId}:${kind}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function unsubscribeLink(userId: string, kind: NotificationKind) {
  const origin = (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  return `${origin}/unsubscribe?token=${unsubscribeToken(userId, kind)}`;
}

/** The user and kind a token was issued for, or null if it isn't one of ours. */
export function readUnsubscribeToken(token: string | undefined | null) {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [userId, kind] = Buffer.from(payload, "base64url").toString().split(":");
  if (!userId || !(kind in NotificationKind)) return null;
  return { userId, kind: kind as NotificationKind };
}
